<#
.SYNOPSIS
  Starts the whole SEH Intelligence Platform: the four Insights Assistant services and the UI, each in its own window,
  then waits until the gateway says every service is up and opens the app.

.DESCRIPTION
  PostgreSQL and Neo4j must already be running, and the passwords and the Bedrock (or OpenAI) key set with user-secrets (see README.md).
  A service whose port is already in use is left as it is, so running this again only starts what's missing.
  Close a window (or press Ctrl+C in it) to stop that service, or run stop-all.ps1 to stop them all.

.PARAMETER NoUi
  Don't start the UI dev server (for example when the gateway serves the built UI).

.PARAMETER NoBrowser
  Don't open the browser at the end.

.EXAMPLE
  .\start-all.ps1
#>
param(
    [switch]$NoUi,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$ui = Join-Path $root 'frontend'

# In the order they're started. Each can start without the others; the gateway reports which are missing.
$services = @(
    @{ Name = 'Analytics'; Project = 'Insights.Analytics'; Port = 5100 },
    @{ Name = 'AI Hub'; Project = 'Insights.AiHub'; Port = 5200 },
    @{ Name = 'DB Catalog'; Project = 'Insights.DbCatalog'; Port = 5300 },
    @{ Name = 'Gateway'; Project = 'Insights.Gateway'; Port = 5000 }
)
$uiPort = 5174
$appUrl = "http://localhost:$uiPort/"
$healthUrl = 'http://localhost:5000/health'

# Whether something listens on the port, on IPv4 or IPv6 (the UI dev server listens on ::1 only).
function Test-Port([int]$port) {
    foreach ($address in '127.0.0.1', '::1') {
        $client = New-Object System.Net.Sockets.TcpClient ([System.Net.IPAddress]::Parse($address).AddressFamily)
        try {
            $wait = $client.BeginConnect($address, $port, $null, $null)
            if ($wait.AsyncWaitHandle.WaitOne(300) -and $client.Connected) { return $true }
        }
        catch { }
        finally { $client.Close() }
    }
    return $false
}

# A new PowerShell window that runs one command in a folder and stays open if it stops, so its error can be read.
function Start-Window([string]$title, [string]$folder, [string]$command) {
    $script = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location -LiteralPath '$folder'; $command"
    Start-Process powershell.exe -WorkingDirectory $folder -ArgumentList @('-NoExit', '-NoProfile', '-Command', $script) | Out-Null
}

foreach ($tool in 'dotnet', 'npm') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        if ($tool -eq 'npm' -and $NoUi) { continue }
        throw "$tool isn't installed or isn't on the PATH. See README.md for the prerequisites."
    }
}

$toStart = @($services | Where-Object { -not (Test-Port $_.Port) })
foreach ($s in $services | Where-Object { $toStart -notcontains $_ }) {
    Write-Host "  $($s.Name) is already running on port $($s.Port)" -ForegroundColor DarkGray
}

if ($toStart.Count -gt 0) {
    # One build up front, so the services don't all build the shared project at the same time.
    # A running service locks its own files, so only the ones being started are built.
    Write-Host 'Building the services...' -ForegroundColor Cyan
    foreach ($s in $toStart) {
        dotnet build (Join-Path $backend "src\$($s.Project)") -nologo -v q
        if ($LASTEXITCODE -ne 0) { throw "$($s.Name) didn't build. Fix the errors above and run this again." }
    }
    foreach ($s in $toStart) {
        Write-Host "  Starting $($s.Name) on port $($s.Port)" -ForegroundColor Cyan
        Start-Window "$($s.Name) :$($s.Port)" $backend "dotnet run --no-build --project src\$($s.Project)"
    }
}

if (-not $NoUi) {
    if (Test-Port $uiPort) {
        Write-Host "  The UI is already running on port $uiPort" -ForegroundColor DarkGray
    }
    else {
        if (-not (Test-Path (Join-Path $ui 'node_modules'))) {
            Write-Host 'Installing the UI packages (first run only)...' -ForegroundColor Cyan
            Push-Location $ui
            try { npm install } finally { Pop-Location }
            if ($LASTEXITCODE -ne 0) { throw "npm install failed. See the errors above." }
        }
        Write-Host "  Starting the UI on port $uiPort" -ForegroundColor Cyan
        Start-Window "UI :$uiPort" $ui 'npm run dev'
    }
}

# Analytics loads the knowledge model at startup, so give everything up to two minutes.
Write-Host 'Waiting for every service to be ready...' -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(2)
$health = $null
while ((Get-Date) -lt $deadline) {
    try {
        $health = Invoke-RestMethod $healthUrl -TimeoutSec 10
        if ($health.ok) { break }
    }
    catch { $health = $null }
    Start-Sleep -Seconds 3
}

if ($health -and $health.ok) {
    Write-Host 'Everything is running.' -ForegroundColor Green
}
elseif ($health) {
    Write-Host 'The gateway is up, but some services are not:' -ForegroundColor Yellow
    foreach ($p in $health.services.PSObject.Properties) {
        $color = if ($p.Value.ok) { 'Green' } else { 'Red' }
        Write-Host ("  {0,-10} {1}" -f $p.Name, $p.Value.detail) -ForegroundColor $color
    }
    Write-Host 'Check that service''s window for the error. A common cause is PostgreSQL or Neo4j not running.'
}
else {
    Write-Host "The gateway didn't answer at $healthUrl. Check the Gateway window for the error." -ForegroundColor Red
}

if (-not $NoUi) {
    Write-Host "Open $appUrl and sign in." -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $appUrl }
}
