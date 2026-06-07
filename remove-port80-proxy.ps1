# Retire pare-feu + ancien portproxy Windows (PowerShell administrateur)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host "ERREUR : exécute ce script en tant qu'administrateur." -ForegroundColor Red
    exit 1
}

netsh interface portproxy delete v4tov4 listenport=80 listenaddress=0.0.0.0 2>$null | Out-Null
Remove-NetFirewallRule -DisplayName "LoL Coach HTTP 80 (Python proxy)" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "LoL Coach HTTP 80 (proxy -> 8081)" -ErrorAction SilentlyContinue
Write-Host "Règles port 80 supprimées."
