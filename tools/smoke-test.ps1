param(
  [string]$Url = "http://localhost/"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent

function Get-BrowserPath {
  $candidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "No supported browser executable was found."
}

function Assert-Contains {
  param(
    [string]$Html,
    [string]$Pattern,
    [string]$Message
  )

  if ($Html -notmatch $Pattern) {
    throw $Message
  }
}

function Assert-NotContains {
  param(
    [string]$Html,
    [string]$Pattern,
    [string]$Message
  )

  if ($Html -match $Pattern) {
    throw $Message
  }
}

$browser = Get-BrowserPath
$smokeRoot = Join-Path $repoRoot ".smoke"
$profileDir = Join-Path $smokeRoot "browser-profile"
$domPath = Join-Path $smokeRoot "dumped-dom.html"

New-Item -ItemType Directory -Force $smokeRoot | Out-Null
New-Item -ItemType Directory -Force $profileDir | Out-Null

$response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 10
if ($response.StatusCode -ne 200) {
  throw "Expected HTTP 200 from $Url but got $($response.StatusCode)."
}

$arguments = @(
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-crash-reporter",
  "--disable-features=Crashpad",
  "--user-data-dir=$profileDir",
  "--virtual-time-budget=15000",
  "--dump-dom",
  $Url
)

$dom = & $browser $arguments 2>&1
$domText = ($dom | Out-String)
$domText | Set-Content -Encoding UTF8 $domPath

if ([string]::IsNullOrWhiteSpace($domText)) {
  throw "Smoke test failed: browser returned an empty DOM dump."
}

Assert-Contains -Html $domText -Pattern '<select id="team-select"' -Message "Smoke test failed: team picker was not rendered."
Assert-Contains -Html $domText -Pattern '<option value="' -Message "Smoke test failed: team picker options were not hydrated."
Assert-NotContains -Html $domText -Pattern '>MLB Team Dashboard<' -Message "Smoke test failed: app title never hydrated from live state."
Assert-NotContains -Html $domText -Pattern '>Loading dashboard data\.\.\.<' -Message "Smoke test failed: app stayed stuck in loading state."

$leftProbable = $domText -match 'id="left-card-label"[^>]*>[^<]*Probable'
$rightProbable = $domText -match 'id="right-card-label"[^>]*>[^<]*Probable'

if ($leftProbable) {
  Assert-NotContains -Html $domText -Pattern 'id="batter-name"[^>]*>TBD<' -Message "Smoke test failed: probable starter name on the left card is still TBD."
}

if ($rightProbable) {
  Assert-NotContains -Html $domText -Pattern 'id="pitcher-name"[^>]*>TBD<' -Message "Smoke test failed: probable starter name on the right card is still TBD."
}

Write-Output "Smoke test passed for $Url"
Write-Output "DOM dump saved to $domPath"
