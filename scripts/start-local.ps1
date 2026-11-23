param(
  [ValidateRange(1, 65535)]
  [int]$WebPort = 8000,
  [ValidateRange(1, 65535)]
  [int]$ApiPort = 8080
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repositoryRoot 'apps\web'
$apiRoot = Join-Path $repositoryRoot 'apps\api'
$apiPython = Join-Path $apiRoot '.venv\Scripts\python.exe'
$webUrl = "http://127.0.0.1:$WebPort/"
$apiUrl = "http://127.0.0.1:$ApiPort"
$apiProcess = $null
$webProcess = $null

if (-not (Test-Path -LiteralPath $apiPython)) {
  throw "The API environment is missing. Create it and install dependencies with: py -3.11 -m venv apps\api\.venv; .\apps\api\.venv\Scripts\python.exe -m pip install -r apps\api\requirements.txt"
}

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) {
  throw 'Google Cloud CLI is required. Install gcloud and authenticate with gcloud auth application-default login.'
}

$project = (& $gcloud.Source config get-value project 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or -not $project -or $project -eq '(unset)') {
  throw 'No default gcloud project is configured. Set one with: gcloud config set project PROJECT_ID'
}

$null = & $gcloud.Source auth application-default print-access-token 2>$null
if ($LASTEXITCODE -ne 0) {
  throw 'Google Cloud ADC credentials are unavailable. Run: gcloud auth application-default login'
}

$env:GOOGLE_CLOUD_PROJECT = $project
if (-not $env:GOOGLE_CLOUD_LOCATION) {
  $env:GOOGLE_CLOUD_LOCATION = 'us'
}

foreach ($port in @($WebPort, $ApiPort)) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
  try {
    $listener.Start()
  } catch {
    throw "Port $port is already in use. Stop the existing process or choose another port before starting ClearDraft."
  } finally {
    $listener.Stop()
  }
}

try {
  $apiProcess = Start-Process `
    -FilePath $apiPython `
    -ArgumentList @('-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', "$ApiPort") `
    -WorkingDirectory $apiRoot `
    -PassThru `
    -WindowStyle Hidden

  $webProcess = Start-Process `
    -FilePath $apiPython `
    -ArgumentList @('-m', 'http.server', "$WebPort", '--directory', "`"$webRoot`"") `
    -WorkingDirectory $repositoryRoot `
    -PassThru `
    -WindowStyle Hidden

  $apiReady = $false
  $webReady = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($apiProcess.HasExited) {
      throw "ClearDraft API exited during startup with code $($apiProcess.ExitCode)."
    }
    if ($webProcess.HasExited) {
      throw "ClearDraft web server exited during startup with code $($webProcess.ExitCode)."
    }

    if (-not $apiReady) {
      try {
        $response = Invoke-WebRequest -Uri "$apiUrl/health" -UseBasicParsing -TimeoutSec 2
        $apiReady = $response.StatusCode -eq 200
      } catch {}
    }
    if (-not $webReady) {
      try {
        $response = Invoke-WebRequest -Uri $webUrl -UseBasicParsing -TimeoutSec 2
        $webReady = $response.StatusCode -eq 200 -and $response.Content -match '<title>ClearDraft'
      } catch {
      }
    }
    if ($apiReady -and $webReady) {
      break
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not $apiReady) {
    throw "ClearDraft API did not become ready at $apiUrl."
  }
  if (-not $webReady) {
    throw "ClearDraft web app did not become ready at $webUrl."
  }

  Write-Host "Google Cloud project: $project"
  Write-Host "Vertex AI location: $env:GOOGLE_CLOUD_LOCATION"
  Write-Host "ClearDraft API ready at $apiUrl/"
  Write-Host "ClearDraft web app ready at $webUrl"
  Start-Process $webUrl
  Write-Host 'ClearDraft opened in your browser. Press Ctrl+C here to stop both local servers.'

  while ($true) {
    if ($apiProcess.HasExited) {
      throw "ClearDraft API stopped unexpectedly with code $($apiProcess.ExitCode)."
    }
    if ($webProcess.HasExited) {
      throw "ClearDraft web server stopped unexpectedly with code $($webProcess.ExitCode)."
    }
    Start-Sleep -Seconds 2
  }
} finally {
  if ($webProcess -and -not $webProcess.HasExited) {
    Stop-Process -Id $webProcess.Id -ErrorAction SilentlyContinue
  }
  if ($apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue
  }
}
