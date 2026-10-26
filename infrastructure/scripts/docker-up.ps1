# Infralark - Docker (sequential build avoids parallel context errors)
$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\..\.."

Write-Host "==> Building API (this may take several minutes)..."
docker compose build api
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Building Worker..."
docker compose build worker
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Building AI Engine..."
docker compose build ai-engine
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Starting services..."
docker compose up -d

Write-Host ""
Write-Host "Infralark is running!"
Write-Host "  API:     http://localhost:3000"
Write-Host "  Swagger: http://localhost:3000/api/docs"
Write-Host "  Admin:   the ADMIN_EMAIL from .env (no default account)"