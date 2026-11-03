# ClearDraft

ClearDraft is a browser-only writing assistant. It offers optional, rule-based writing suggestions, text statistics, a local heuristic AI-likelihood estimate, and a rule-based humanizer; it does not connect to an AI service.

## Monorepo layout

```text
apps/
  web/                 Static web application and GitHub Pages document root
                       (ai-detector.js, humanizer.js: local AI estimate + rewrite)
docs/
  detector-analysis.md Analysis of detector signals and the humanizer's targets
tests/
  test_static_site.py  Dependency-free static-site checks
  ai_features.test.js  Node unit tests for the detector and humanizer
scripts/
  open-and-check.ps1   Local HTTP smoke check and browser launcher
.github/
  workflows/
    pages.yml          Pull request validation and GitHub Pages deployment
```

## Run locally

Open `apps/web/index.html` directly in a browser, or start a local static server from the repository root:

```powershell
py -m http.server 8000 --directory apps/web
```

Then open `http://localhost:8000`. The app has no build step, npm packages, API key, or backend service.

To start the app, check its HTTP response and required controls, and open it in your browser from PowerShell:

```powershell
.\scripts\open-and-check.ps1
```

The script keeps the local server running until you press `Ctrl+C`. To run only its HTTP/markup smoke check:

```powershell
.\scripts\open-and-check.ps1 -CheckOnly
```

## Validate

The checks use Python's standard library, plus Node's built-in test runner for the AI features:

```powershell
py -m unittest discover --start-directory tests --verbose
node --test tests/ai_features.test.js
```

GitHub Actions runs these checks for pushes and pull requests targeting `main`.

## Deploy to GitHub Pages

The workflow validates every push and pull request. On `main`, it deploys `apps/web` only after GitHub Pages is enabled. If Pages is not configured, validation still succeeds and the deployment job explains the required setup in the Actions summary instead of failing at the configure step.

To enable deployment, open **Settings → Pages** in the repository and set **Build and deployment → Source** to **GitHub Actions**, then re-run the workflow or push to `main`. The project site URL is `https://<owner>.github.io/<repository>/`.

GitHub Pages availability for private repositories depends on the GitHub plan. Published Pages sites are publicly accessible even when their source repository is private. This workflow does not change repository visibility; confirm that public website access is acceptable before enabling Pages.

## App features

- Word count and writing goals: clearer, more concise, more formal, and friendlier.
- Individual, reviewable writing suggestions with accept, dismiss, and accept-all controls.
- A revised version preview with copy and replace actions.
- A local writing-outline scaffold built from a topic and the user's notes.
- On-request descriptive statistics: word and sentence counts, average sentence length, sentence-length range, repeated two-word phrases, and long-sentence guidance.
- AI likelihood check: a local heuristic estimate (AI-typical phrases, sentence-length uniformity, repetition, contractions) with a per-signal breakdown. It is not Grammarly's model and not an authorship verdict — see `docs/detector-analysis.md`.
- Humanize: rule-based rewrites targeting those same signals, iterating until the estimate is at or under 10% (or reporting the achieved score if it cannot reach it). The result goes to the revised-version preview for review, copy, or replace.

The statistics panel on its own is not an AI detector. Suggestions and humanizing use simple local rules, not AI-generated feedback; review all changes to ensure they preserve your meaning. Text is processed in the current browser page and is not sent to a service or saved by the app.
