param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\backups"),
  [string]$EnvFile
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composeFile = Join-Path $projectRoot "docker-compose.yml"
if (-not $EnvFile) { $EnvFile = Join-Path $projectRoot ".env.selfhost" }

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
  throw "Missing $EnvFile. Copy .env.selfhost.example and configure it first."
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$resolvedOutput = (Resolve-Path -LiteralPath $OutputDirectory).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $resolvedOutput "agent-web-$timestamp.sql"

docker compose --file $composeFile --env-file $EnvFile exec -T postgres sh -c 'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' |
  Set-Content -LiteralPath $backupFile -Encoding utf8NoBOM

if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE."
}
if (-not (Test-Path -LiteralPath $backupFile -PathType Leaf) -or (Get-Item -LiteralPath $backupFile).Length -eq 0) {
  throw "Backup file was not created or is empty."
}

Write-Output $backupFile
