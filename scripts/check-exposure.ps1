# Diagnostic acces public LoL Coach
param(
    [string]$ConfigPath = ""
)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (-not $ConfigPath) { $ConfigPath = Join-Path $root "config\server.json" }
$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$Hostname = $config.publicHost
$PublicUrl = $config.publicUrl
$ListenPort = [int]$config.listenPort

function Test-HttpStatus($url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
        return @{ Ok = $true; Code = $r.StatusCode; Error = $null; Headers = $r.Headers }
    } catch {
        return @{ Ok = $false; Code = $null; Error = $_.Exception.Message; Headers = $null }
    }
}

function Test-PortListening($port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return [bool]$conn
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

Write-Host ""
Write-Host "=== LoL Coach - diagnostic ($Hostname) ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1] Admin : $(if ($isAdmin) { 'OUI (requis port 80)' } else { 'NON' })"
Write-Host "[2] Config : config\server.json"
Write-Host "    publicHost = $Hostname"
Write-Host "    publicUrl  = $PublicUrl"
Write-Host "    listenPort = $ListenPort"

try {
    $publicIp = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 8).ip
} catch {
    $publicIp = $null
}

try {
    $dnsIp = (Resolve-DnsName $Hostname -Type A -ErrorAction Stop | Select-Object -First 1).IPAddress
} catch {
    $dnsIp = $null
}

$localIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "[3] IP locale     : $localIp"
Write-Host "[4] IP publique   : $publicIp"
Write-Host "[5] DNS $Hostname -> $dnsIp"

if ($publicIp -and $dnsIp) {
    if ($dnsIp -eq $publicIp) {
        Write-Host "    OK - No-IP synchronise" -ForegroundColor Green
    } else {
        Write-Host "    ERREUR - DNS != IP publique (relance DUC No-IP)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[6] Serveur local port $ListenPort"
$listen = Test-PortListening $ListenPort
Write-Host "    Ecoute : $(if ($listen) { 'oui' } else { 'non - lance start.bat EN ADMIN' })"

$localHttp = Test-HttpStatus "http://127.0.0.1:${ListenPort}/"
$healthHttp = Test-HttpStatus "http://127.0.0.1:${ListenPort}/health"
if ($localHttp.Ok) { $localLine = $localHttp.Code } else { $localLine = "FAIL - $($localHttp.Error)" }
Write-Host "    HTTP /        : $localLine"
if ($healthHttp.Ok) {
    Write-Host "    HTTP /health  : OK (domaine serveur configure)" -ForegroundColor Green
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:${ListenPort}/health" -TimeoutSec 4
        Write-Host "    publicHost    : $($health.publicHost)"
    } catch {}
} else {
    Write-Host "    HTTP /health  : FAIL - $($healthHttp.Error)"
}

Write-Host ""
Write-Host "[7] Pare-feu Windows"
Get-NetFirewallRule -DisplayName "LoL Coach HTTP*" -ErrorAction SilentlyContinue |
    Select-Object DisplayName, Enabled, Action | Format-Table -AutoSize

Write-Host "[8] Box Virgin Plus"
Write-Host "    Regle : TCP $ListenPort externe -> ${localIp}:$ListenPort"
Write-Host "    Pas besoin de redemarrer la box apres un port forward (sauf rares modeles)."
Write-Host "    Test 4G : $PublicUrl/  (pas https, pas :8081 si tu utilises le port 80)"

Write-Host ""
Write-Host "[9] Test URL publique depuis ce PC (souvent timeout = normal sans hairpin NAT)"
$extHttp = Test-HttpStatus "${PublicUrl}/"
if ($extHttp.Ok) {
    Write-Host "    $PublicUrl -> $($extHttp.Code)" -ForegroundColor Green
} else {
    Write-Host "    $PublicUrl -> FAIL ($($extHttp.Error))"
    Write-Host "    Si local OK mais URL publique FAIL : box ou CGNAT Virgin (verifie IP WAN box = $publicIp)"
}

Write-Host ""
