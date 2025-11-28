# Apply Supabase Migrations Helper Script
# This script helps apply new migrations when `supabase db push` is unreliable
#
# Usage: powershell -ExecutionPolicy Bypass -File apply-migrations.ps1

param(
    [string]$MigrationPattern = "202511230*"  # Pattern to match migration files
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Jensify Migration Helper ===" -ForegroundColor Cyan
Write-Host "This script combines new migrations and helps you apply them via Supabase Dashboard`n"

# Get migration directory
$migrationsDir = Join-Path $PSScriptRoot "migrations"

if (-not (Test-Path $migrationsDir)) {
    Write-Host "Error: Migrations directory not found at $migrationsDir" -ForegroundColor Red
    exit 1
}

# Find migration files matching pattern
Write-Host "Searching for migrations matching pattern: $MigrationPattern" -ForegroundColor Yellow
$migrationFiles = Get-ChildItem -Path $migrationsDir -Filter "$MigrationPattern.sql" | Sort-Object Name

if ($migrationFiles.Count -eq 0) {
    Write-Host "No migration files found matching pattern: $MigrationPattern" -ForegroundColor Yellow
    Write-Host "Available migrations:"
    Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Select-Object -Last 5 | ForEach-Object {
        Write-Host "  - $($_.Name)"
    }
    exit 0
}

Write-Host "Found $($migrationFiles.Count) migration(s):" -ForegroundColor Green
$migrationFiles | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }

# Create combined SQL file
$combinedFile = Join-Path $PSScriptRoot "apply_combined_migrations.sql"
$combinedContent = @"
-- Combined Migrations
-- Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
-- Migrations included: $($migrationFiles.Count)
--
$(foreach ($file in $migrationFiles) { "-- * $($file.Name)`n" })
-- ============================================================================

"@

foreach ($file in $migrationFiles) {
    $content = Get-Content $file.FullName -Raw
    $combinedContent += "`n`n-- ============================================================================`n"
    $combinedContent += "-- Migration: $($file.Name)`n"
    $combinedContent += "-- ============================================================================`n`n"
    $combinedContent += $content
}

# Save combined file
$combinedContent | Out-File -FilePath $combinedFile -Encoding utf8
Write-Host "`nCombined SQL saved to: $combinedFile" -ForegroundColor Green

# Copy to clipboard
$combinedContent | Set-Clipboard
Write-Host "SQL copied to clipboard!" -ForegroundColor Green

# Offer to open Supabase SQL Editor
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Paste the SQL into Supabase SQL Editor (opening now...)" -ForegroundColor White
Write-Host "2. Click 'Run' to execute the migrations" -ForegroundColor White
Write-Host "3. Verify the migrations succeeded" -ForegroundColor White

Start-Sleep -Seconds 2
Start-Process "https://supabase.com/dashboard/project/bfudcugrarerqvvyfpoz/sql/new"

Write-Host "`nAfter applying migrations, would you like to mark them as applied in migration history?" -ForegroundColor Yellow
$response = Read-Host "Mark as applied? (y/n)"

if ($response -eq "y" -or $response -eq "Y") {
    Write-Host "`nMarking migrations as applied..." -ForegroundColor Yellow

    foreach ($file in $migrationFiles) {
        $migrationName = $file.BaseName
        Write-Host "  Repairing: $migrationName..." -ForegroundColor Gray

        try {
            $result = & supabase migration repair --status applied $migrationName 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "    ✓ $migrationName" -ForegroundColor Green
            } else {
                Write-Host "    ✗ Failed: $result" -ForegroundColor Red
            }
        } catch {
            Write-Host "    ✗ Error: $_" -ForegroundColor Red
        }
    }

    Write-Host "`nMigration history updated!" -ForegroundColor Green
} else {
    Write-Host "`nSkipped migration history update. You can run this later:" -ForegroundColor Yellow
    foreach ($file in $migrationFiles) {
        Write-Host "  supabase migration repair --status applied $($file.BaseName)" -ForegroundColor Gray
    }
}

Write-Host "`n=== Migration Helper Complete ===" -ForegroundColor Cyan
Write-Host "Combined SQL file location: $combinedFile"
Write-Host ""
