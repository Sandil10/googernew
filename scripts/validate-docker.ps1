param(
    [string]$EnvFile = ".env.docker.example",
    [switch]$Build
)

$ErrorActionPreference = "Stop"

function Fail($message) {
    Write-Host "[FAIL] $message" -ForegroundColor Red
    exit 1
}

function Ok($message) {
    Write-Host "[OK] $message" -ForegroundColor Green
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker is not installed or not on PATH. Install Docker Engine/Desktop on this server first."
}

$dockerVersion = docker --version
Ok $dockerVersion

$composeVersion = docker compose version
Ok $composeVersion

if (-not (Test-Path $EnvFile)) {
    Fail "Env file not found: $EnvFile"
}

docker compose --env-file $EnvFile config --quiet
Ok "docker compose config is valid"

if ($Build) {
    docker compose --env-file $EnvFile build
    Ok "docker compose build completed"
}

Write-Host ""
Write-Host "Next run:" -ForegroundColor Cyan
Write-Host "docker compose --env-file $EnvFile up -d redis main-backend main-worker main-frontend admin-app"
