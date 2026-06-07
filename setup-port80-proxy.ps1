# Prerequis serveur public port 80 (PowerShell administrateur)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "ERREUR : execute setup.bat en tant qu administrateur." -ForegroundColor Red
    exit 1
}

$config = Get-Content "config\server.json" -Raw | ConvertFrom-Json
$port = [int]$config.listenPort
$publicHost = $config.publicHost
$publicUrl = $config.publicUrl

Write-Host "Installation aiohttp..."
python -m pip install -r requirements.txt

function Ensure-FirewallRule($displayName, $tcpPort) {
    Remove-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $displayName -Direction Inbound -Protocol TCP -LocalPort $tcpPort -Action Allow | Out-Null
    Write-Host "Pare-feu : $displayName (TCP $tcpPort)"
}

Ensure-FirewallRule "LoL Coach HTTP $port" $port
Ensure-FirewallRule "LoL Coach HTTP 8081" 8081

netsh interface portproxy delete v4tov4 listenport=80 listenaddress=0.0.0.0 2>$null | Out-Null
Remove-NetFirewallRule -DisplayName "LoL Coach HTTP 80 (Python proxy)" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "LoL Coach HTTP 80 (proxy -> 8081)" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "OK - domaine : $publicHost" -ForegroundColor Green
Write-Host "  1. Box Virgin : TCP $port -> IP locale de ce PC (192.168.0.2)"
Write-Host "  2. start.bat en administrateur"
Write-Host "  3. URL publique : $publicUrl"
Write-Host ""
