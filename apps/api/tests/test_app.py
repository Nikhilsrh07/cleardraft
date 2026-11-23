from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient
from google.auth.exceptions import DefaultCredentialsError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import RateLimiter, ReviewRequest, create_app, generate_review, get_vertex_client  # noqa: E402


class FakeModels:
    def __init__(self, response_text: str | None = None, error: Exception | None = None) -> None:
        self.response_text = response_text
        self.error = error
        self.last_request: dict[str, object] | None = None

    def generate_content(self, **kwargs: object) -> SimpleNamespace:
        self.last_request = kwargs
        if self.error:
            raise self.error
        return SimpleNamespace(text=self.response_text)


class FakeRemoteError(Exception):
    def __init__(self, code: int) -> None:
        super().__init__("remote service error")
        self.code = code


class ApiTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.result = {
            "revised_text": "The revised text is clear.",
            "changes": ["Corrected grammar and tightened wording."],
            "suggestions": [
                {
                    "original": "The original text.",
                    "replacement": "The revised text is clear.",
                    "reason": "Make the sentence clearer.",
                    "category": "Clarity",
                },
                {
                    "original": "not present",
                    "replacement": "present",
                    "reason": "This quote is absent.",
                    "category": "Correctness",
                },
                {
                    "original": "The",
                    "replacement": "This",
                    "reason": "Make the opening more specific.",
                    "category": "Clarity",
                },
            ],
        }
        self.fake_models = FakeModels(response_text=json.dumps(self.result))
        self.app = create_app()
        self.client = AsyncClient(
            transport=ASGITransport(app=self.app),
            base_url="http://testserver",
        )
        self.addAsyncCleanup(self.client.aclose)
        self.vertex_client = SimpleNamespace(models=self.fake_models)
        self.vertex_patch = patch("app.get_vertex_client", return_value=self.vertex_client)
        self.vertex_patch.start()
        self.addCleanup(self.vertex_patch.stop)

    async def test_health_endpoint_is_available_without_vertex_credentials(self) -> None:
        response = await self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_vertex_client_uses_adc_project_and_default_region(self) -> None:
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("app.google.auth.default", return_value=(object(), "active-gcloud-project")),
            patch("app.genai.Client") as client_factory,
        ):
            get_vertex_client()

        self.assertEqual(client_factory.call_args.kwargs["project"], "active-gcloud-project")
        self.assertEqual(client_factory.call_args.kwargs["location"], "us")

    async def test_review_returns_revised_text_notes_and_model(self) -> None:
        response = await self.client.post(
            "/api/review",
            json={"text": "The original text.", "goal": "clear"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["revised_text"], self.result["revised_text"])
        self.assertEqual(response.json()["changes"], self.result["changes"])
        self.assertEqual(response.json()["model"], "gemini-3.8-flash")
        self.assertEqual(
            response.json()["suggestions"],
            [
                {
                    **self.result["suggestions"][0],
                    "start": 0,
                    "end": len("The original text."),
                }
            ],
        )
        self.assertIn("The original text.", str(self.fake_models.last_request))

    def test_review_omits_non_unique_and_overlapping_edit_quotes(self) -> None:
        self.fake_models.response_text = json.dumps(
            {
                "revised_text": "The repeated sentence.",
                "changes": [],
                "suggestions": [
                    {
                        "original": "repeat",
                        "replacement": "repeat once",
                        "reason": "Remove repetition.",
                        "category": "Conciseness",
                    },
                    {
                        "original": "repeat and repeat",
                        "replacement": "repeat",
                        "reason": "Shorten the phrase.",
                        "category": "Conciseness",
                    },
                    {
                        "original": "repeat and",
                        "replacement": "repeat",
                        "reason": "This overlaps another suggestion.",
                        "category": "Conciseness",
                    },
                ],
            }
        )
        response = generate_review(ReviewRequest(text="repeat and repeat", goal="clear"))
        self.assertEqual(len(response.suggestions), 1)
        self.assertEqual(response.suggestions[0].original, "repeat and repeat")

    async def test_review_rejects_empty_oversized_and_invalid_goal_requests(self) -> None:
        cases = (
            ({"text": "  ", "goal": "clear"}, 422),
            ({"text": "x" * 12_001, "goal": "clear"}, 422),
            ({"text": "Text", "goal": "detect"}, 422),
        )
        for payload, expected_status in cases:
            with self.subTest(payload=payload["goal"]):
                response = await self.client.post("/api/review", json=payload)
                self.assertEqual(response.status_code, expected_status)

    async def test_review_reports_missing_vertex_configuration(self) -> None:
        self.vertex_patch.stop()
        with patch.dict(os.environ, {}, clear=True):
            with patch(
                "app.google.auth.default",
                side_effect=DefaultCredentialsError("no ADC"),
            ):
                response = await self.client.post(
                    "/api/review",
                    json={"text": "Some text.", "goal": "clear"},
                )
        self.vertex_patch.start()
        self.assertEqual(response.status_code, 503)
        self.assertIn("GOOGLE_CLOUD_PROJECT", response.json()["detail"])

    async def test_review_reports_model_failures_without_returning_a_fake_success(self) -> None:
        self.fake_models.error = RuntimeError("model unavailable")
        with self.assertLogs("cleardraft.api", level="ERROR"):
            response = await self.client.post(
                "/api/review",
                json={"text": "Some text.", "goal": "clear"},
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Gemini could not complete the review. Please try again.")

    async def test_review_explains_unavailable_model_or_location(self) -> None:
        self.fake_models.error = FakeRemoteError(404)
        with self.assertLogs("cleardraft.api", level="ERROR"):
            response = await self.client.post(
                "/api/review",
                json={"text": "Some text.", "goal": "clear"},
            )
        self.assertEqual(response.status_code, 503)
        self.assertIn("GOOGLE_CLOUD_LOCATION", response.json()["detail"])

    async def test_review_rejects_invalid_model_output(self) -> None:
        self.fake_models.response_text = (
            '{"revised_text": "", "changes": [], "suggestions": []}'
        )
        with self.assertLogs("cleardraft.api", level="ERROR"):
            response = await self.client.post(
                "/api/review",
                json={"text": "Some text.", "goal": "clear"},
            )
        self.assertEqual(response.status_code, 502)

    async def test_review_applies_per_client_rate_limit(self) -> None:
        self.app.state.rate_limiter = RateLimiter(limit=1, window_seconds=60)
        first = await self.client.post(
            "/api/review",
            json={"text": "Some text.", "goal": "clear"},
        )
        second = await self.client.post(
            "/api/review",
            json={"text": "Some more text.", "goal": "clear"},
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertIn("Retry-After", second.headers)

    async def test_cors_is_limited_to_configured_site_origins(self) -> None:
        allowed = await self.client.options(
            "/api/review",
            headers={
                "Origin": "http://localhost:8000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        denied = await self.client.options(
            "/api/review",
            headers={
                "Origin": "https://example.invalid",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        self.assertEqual(allowed.headers.get("access-control-allow-origin"), "http://localhost:8000")
        self.assertNotIn("access-control-allow-origin", denied.headers)


if __name__ == "__main__":
    unittest.main()
