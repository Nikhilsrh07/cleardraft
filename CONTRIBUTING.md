# Contributing

## Local checks

Run the dependency-free static-site checks before opening a pull request:

```powershell
py -m unittest discover --start-directory tests --verbose
```

## Web app changes

The GitHub Pages document root is `apps/web`. Keep static assets inside that folder and use relative paths so the app works under the repository's project-site URL.

## Pull requests

Pull requests to `main` run the static-site validation workflow. Deployment runs only after a successful push to `main`.
