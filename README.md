# ClearDraft

ClearDraft is a writing assistant with two explicit modes: local, rule-based suggestions that stay in the browser, and an optional Gemini review through a FastAPI backend on Google Cloud Vertex AI. It provides grammar, clarity, concision, and tone feedback; it does not estimate authorship or optimize text for an AI detector.

## Monorepo layout

```text
apps/
  web/                 Static web application and GitHub Pages document root
  api/                 FastAPI backend, Vertex AI integration, and Cloud Run files
tests/
  test_static_site.py  Dependency-free static-site checks
scripts/
  open-and-check.ps1   Local HTTP smoke check and browser launcher
  start-local.ps1      Start the web app and Gemini API together
.github/
  workflows/
    pages.yml          Static-site and API tests, then GitHub Pages deployment
```

## Writing features

Grammarly's public feature pages describe proofreading for grammar, spelling, and punctuation; contextual clarity and tone suggestions; and full-paragraph rewrites. ClearDraft now follows those broad writing-assistant patterns with its own UI, text, and implementation: users can preview a Gemini revision, inspect the reasoning notes, and apply or dismiss individual, anchored edits. It also retains local writing-goal rules and text statistics.

These are references to public product descriptions, not an endorsement or an exact reproduction:

- [Grammarly writing features](https://www.grammarly.com/features)
- [Grammarly grammar checker](https://www.grammarly.com/grammar-check)
- [Grammarly AI writing assistant](https://www.grammarly.com/ai-writing-assistant)

ClearDraft does not claim that its advice is always correct. Review edits for meaning and context. It does not calculate AI authorship probabilities or rewrite toward detector scores.

## Run locally

The browser app can run by itself, but Gemini review requires the API and Google Cloud credentials.

1. Create an isolated API environment and install its dependencies:

   ```powershell
   py -3.11 -m venv apps\api\.venv
   .\apps\api\.venv\Scripts\python.exe -m pip install -r apps\api\requirements.txt
   ```

2. Authenticate with Google Cloud ADC. The API reads the project from active ADC and uses the `us` Vertex AI multi-region because the current Gemini model is not available at the gcloud `us-central1` region. Set environment variables to override these values:

   ```powershell
   gcloud auth application-default login
   $env:GOOGLE_CLOUD_PROJECT = (gcloud config get-value project)
   $env:GOOGLE_CLOUD_LOCATION = "us"
   ```

   The API uses `gemini-3.8-flash` by default. Override `GEMINI_MODEL` only with a model available in the selected Vertex AI location. Vertex AI must be enabled for the project, and the active identity needs permission to invoke it.

3. In one PowerShell window, start the API:

   ```powershell
   .\apps\api\.venv\Scripts\python.exe -m uvicorn app:app --app-dir apps\api --host 127.0.0.1 --port 8080
   ```

4. In another window, start the web app:

   ```powershell
   py -m http.server 8000 --directory apps\web
   ```

   Open `http://localhost:8000`. The local `apps/web/config.js` points at the API on port 8080. For a frontend-only smoke check, use `.\scripts\open-and-check.ps1 -CheckOnly`.

After creating `apps\api\.venv` and authenticating once, you can start both servers and open the browser with a single command:

```powershell
.\scripts\start-local.ps1
```

The launcher reads the project from `gcloud config get-value project`, verifies ADC without printing its token, and defaults Vertex AI to the `us` multi-region because `gemini-3.8-flash` is not available at the `us-central1` regional endpoint. You can override the model location for another supported endpoint with `$env:GOOGLE_CLOUD_LOCATION` before running it. Press `Ctrl+C` in the launcher window to stop both servers.

The backend sends text to Vertex AI only after the user selects **Review with Gemini**. Requests are limited to 12,000 characters, up to 10 reviews per minute per API process/client address, and a 30-second model request timeout. The in-memory limit is a basic cost guard, not a substitute for user authentication or production abuse protection. Do not expose a production service publicly without an authentication and cost-control plan.

## Validate

```powershell
py -m unittest discover --start-directory tests --verbose
.\apps\api\.venv\Scripts\python.exe -m unittest discover --start-directory apps\api\tests --verbose
```

GitHub Actions installs the API dependencies and runs both test suites on pushes and pull requests targeting `main`.

## Deploy the backend to Cloud Run

`apps/api/Dockerfile` packages the API. `apps/api/cloudrun.yaml` is a Cloud Run Service template with placeholders; replace the Artifact Registry image path and location before applying it. The API obtains its project from Cloud Run's runtime identity. That identity needs the Vertex AI User role, and the selected project must have Vertex AI enabled.

After building and publishing the container image, deploy with:

```powershell
gcloud run services replace apps/api/cloudrun.yaml --project YOUR_PROJECT_ID --region YOUR_REGION
```

The service template does not grant public invocation. A public GitHub Pages frontend cannot call an IAM-protected Cloud Run service directly; production deployment therefore needs a deliberate authentication design (for example, a user-authenticated backend or a protected proxy). Do not grant public invocation just to make the browser request work.

## Connect GitHub Pages

The Pages workflow publishes `apps/web`. Set the repository Actions variable `CLEARDRAFT_API_BASE_URL` to the deployed API base URL to include it in the published `config.js`. If the variable is unset, the site leaves Gemini review unconfigured and continues to support local writing features. Only set this variable after configuring a safe way for the browser to authenticate with the API.

To enable Pages, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**. Published Pages sites are publicly accessible even when their source repository is private.

## Muse AI

No Muse AI repository or official API endpoint was provided, so this project does not fabricate an integration or download code from an unspecified source. Provide the product's official API/documentation URL and authentication approach before adding it as a separate review provider.
