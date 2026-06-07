# URL publique gratuite immediate (Cloudflare Quick Tunnel) — sans compte, sans port forwarding.
# Le tunnel s'arrete quand vous fermez la fenetre. Pour un site permanent: deploy_github_pages.ps1
#
# Usage: .\scripts\start_public_tunnel.ps1

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..").Path
$Tools = Join-Path $Root "tools"
$Cf = Join-Path $Tools "cloudflared.exe"
$Port = 8081

if (-not (Test-Path $Cf)) {
    New-Item -ItemType Directory -Force -Path $Tools | Out-Null
    $zip = Join-Path $env:TEMP "cloudflared-windows-amd64.exe.zip"
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Write-Host "Telechargement cloudflared..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $url -OutFile $Cf -UseBasicParsing
}

Push-Location $Root
try {
    $existing = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Host "Demarrage serveur local :$Port ..." -ForegroundColor Cyan
        Start-Process python -ArgumentList "-m","http.server",$Port,"--directory","public" -WindowStyle Hidden
        Start-Sleep -Seconds 2
    }

    Write-Host ""
    Write-Host "Tunnel public (Ctrl+C pour arreter)..." -ForegroundColor Yellow
    Write-Host "Local: http://localhost:$Port" -ForegroundColor Gray
    Write-Host ""
    & $Cf tunnel --url "http://127.0.0.1:$Port"
} finally {
    Pop-Location
}
