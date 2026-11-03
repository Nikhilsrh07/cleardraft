# ClearDraft

ClearDraft is a browser-only writing assistant. It offers optional, rule-based writing suggestions and text statistics; it does not connect to an AI service or determine authorship.

## Monorepo layout

```text
apps/
  web/                 Static web application and GitHub Pages document root
tests/
  test_static_site.py  Dependency-free static-site checks
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

## Validate

The checks use Python's standard library:

```powershell
py -m unittest discover --start-directory tests --verbose
```

GitHub Actions runs these checks for pushes and pull requests targeting `main`.

## Deploy to GitHub Pages

The workflow deploys `apps/web` to GitHub Pages after validation succeeds on `main`. In the repository, open **Settings → Pages** and set the publishing source to **GitHub Actions**. The first deployment is published at `https://<owner>.github.io/<repository>/`.

GitHub Pages is a good low-maintenance fit for this static app. Availability for private repositories depends on the GitHub plan; this setup does not change repository visibility. If Pages is unavailable for the current plan, keep the repository private and use another host or enable Pages only after reviewing the plan.

## App features

- Word count and writing goals: clearer, more concise, more formal, and friendlier.
- Individual, reviewable writing suggestions with accept, dismiss, and accept-all controls.
- A revised version preview with copy and replace actions.
- A local writing-outline scaffold built from a topic and the user's notes.
- On-request descriptive statistics: word and sentence counts, average sentence length, sentence-length range, repeated two-word phrases, and long-sentence guidance.

The statistics are not an AI detector and do not produce authorship probabilities or percentages. Suggestions use simple local rules, not AI-generated feedback; review all changes to ensure they preserve your meaning. Text is processed in the current browser page and is not sent to a service or saved by the app.
