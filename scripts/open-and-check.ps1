param(
  [ValidateRange(1, 65535)]
  [int]$Port = 8000,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repositoryRoot 'apps\web'
$entryPoint = Join-Path $webRoot 'index.html'

if (-not (Test-Path -LiteralPath $entryPoint)) {
  throw "ClearDraft entry point was not found: $entryPoint"
}

$python = Get-Command python, py -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $python) {
  throw 'Python is required to serve the static app. Install Python 3 and try again.'
}

$arguments = @()
if ($python.Name -eq 'py.exe' -or $python.Name -eq 'py') {
  $arguments += '-3'
}
$arguments += @('-m', 'http.server', "$Port", '--directory', "`"$webRoot`"")

$server = Start-Process -FilePath $python.Source -ArgumentList $arguments -PassThru -WindowStyle Hidden
$url = "http://127.0.0.1:$Port/"

try {
  $response = $null
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($server.HasExited) {
      throw "The local web server exited with code $($server.ExitCode)."
    }
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $response -or $response.StatusCode -ne 200) {
    throw "ClearDraft did not respond successfully at $url."
  }

  $requiredMarkers = @(
    '<title>ClearDraft',
    'id="source-text"',
    'id="create-draft-button"',
    'id="analyze-button"'
  )
  foreach ($marker in $requiredMarkers) {
    if ($response.Content -notmatch [regex]::Escape($marker)) {
      throw "The served app is missing the expected page control: $marker"
    }
  }

  Write-Host "HTTP smoke check passed at $url"
  Write-Host 'Found the ClearDraft title, document editor, Generate text, and Analyze text controls.'

  if ($CheckOnly) {
    return
  }

  Start-Process $url
  Write-Host 'ClearDraft opened in your default browser. Press Ctrl+C to stop the local server.'
  while ($true) {
    Start-Sleep -Seconds 2
  }
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
  }
}
