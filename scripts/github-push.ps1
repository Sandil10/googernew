param(
    [Parameter(Mandatory = $true)]
    [string]$RepoUrl,

    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not on PATH."
}

$status = git status --short
if ($status) {
    Write-Host "Working tree has changes:" -ForegroundColor Yellow
    $status
    throw "Commit or discard changes before pushing."
}

$existingRemote = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($existingRemote)) {
    git remote add origin $RepoUrl
    Write-Host "Added origin: $RepoUrl" -ForegroundColor Green
} elseif ($existingRemote -ne $RepoUrl) {
    Write-Host "Updating origin from $existingRemote to $RepoUrl" -ForegroundColor Yellow
    git remote set-url origin $RepoUrl
}

git branch -M $Branch
git push -u origin $Branch
