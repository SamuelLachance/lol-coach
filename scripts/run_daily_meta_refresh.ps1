# Daily LoL Coach meta refresh (lane rates, builds, gol.gg pro tiers)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = (Get-Command python -ErrorAction SilentlyContinue)?.Source
if (-not $Python) { $Python = "python" }
& $Python "$ProjectRoot\scripts\daily_meta_refresh.py"
