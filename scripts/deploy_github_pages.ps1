# Deploie lol-coach sur GitHub Pages (gratuit, HTTPS, sans box/port forwarding).
# Usage: .\scripts\deploy_github_pages.ps1
# Premiere fois: gh auth login (navigateur)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..").Path

$gh = "gh"
if (Test-Path "C:\Program Files\GitHub CLI\gh.exe") { $gh = "C:\Program Files\GitHub CLI\gh.exe" }
elseif (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI manquant. Installez: winget install GitHub.cli"
}

Push-Location $Root

try {
    & $gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Connexion GitHub requise (une seule fois)..." -ForegroundColor Yellow
        & $gh auth login -h github.com -p https -w
    }

    if (-not (Test-Path ".git")) {
        git init -b main
    }

    git add -A
    $status = git status --porcelain
    if ($status) {
        git commit -m "Deploy LoL Coach static site"
    }

    $remote = git remote get-url origin 2>$null
    if (-not $remote) {
        $repoName = "lol-coach"
        Write-Host "Creation du depot GitHub public: $repoName ..." -ForegroundColor Cyan
        & $gh repo create $repoName --public --source=. --remote=origin --push
    } else {
        git push -u origin main
    }

    $owner = & $gh repo view --json owner -q ".owner.login"
    $name = & $gh repo view --json name -q ".name"
    $pagesUrl = "https://${owner}.github.io/${name}/"

    Write-Host ""
    Write-Host "Verifiez que Pages est active: Settings > Pages > Source = GitHub Actions" -ForegroundColor Yellow
    Write-Host "Deploy en cours (workflow Actions). Attendre 1-2 minutes." -ForegroundColor Green
    Write-Host "URL publique: $pagesUrl" -ForegroundColor Green
    Write-Host "Actions:      https://github.com/${owner}/${name}/actions" -ForegroundColor Gray
} finally {
    Pop-Location
}
