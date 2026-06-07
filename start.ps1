# LoL Coach - serveur public port 80 (lolcoach.gotdns.ch)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$configPath = Join-Path $root "config\server.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$PublicHost = $config.publicHost
$PublicUrl = $config.publicUrl
$ListenPort = [int]$config.listenPort
$DevPort = [int]$config.devPort

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not (Test-Path "public\data\champions.json")) {
    Write-Host "Telechargement Data Dragon..."
    python scripts/fetch_ddragon.py
}

function Ensure-Aiohttp {
    python -c "import aiohttp" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Installation aiohttp..."
        python -m pip install -r requirements.txt
    }
}

function Ensure-Firewall($port) {
    $ruleName = "LoL Coach HTTP $port"
    if (Get-Command New-NetFirewallRule -ErrorAction SilentlyContinue) {
        $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        if (-not $existing) {
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
            Write-Host "Pare-feu : port $port ouvert"
        }
    }
}

function Stop-PortListeners($port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
}

if ($isAdmin) {
    Ensure-Aiohttp
    Ensure-Firewall $ListenPort
    Stop-PortListeners $ListenPort
    Start-Sleep -Seconds 1

    Write-Host ""
    Write-Host "Domaine public : $PublicHost"
    Write-Host "URL            : $PublicUrl/"
    Write-Host "Local          : http://localhost/"
    Write-Host "Box            : TCP $ListenPort -> IP de ce PC (check.bat)"
    Write-Host "Health         : http://localhost/health"
    Write-Host "Config         : config\server.json"
    Write-Host "Diag           : check.bat"
    Write-Host "Arret          : Ctrl+C"
    Write-Host ""

    python scripts/serve_public.py --config $configPath
} else {
    Ensure-Aiohttp
    Write-Host ""
    Write-Host "Mode dev (port $DevPort) - $PublicUrl ne marchera PAS sans admin." -ForegroundColor Yellow
    Write-Host "  Clic droit start.bat -> Executer en tant qu administrateur"
    Write-Host ""
    Write-Host "Dev : http://localhost:$DevPort"
    Write-Host "Arret : Ctrl+C"
    Write-Host ""
    python scripts/serve_public.py --config $configPath --port $DevPort
}
