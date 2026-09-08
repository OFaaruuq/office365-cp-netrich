<#
.SYNOPSIS
  Production deploy wrapper for netrichtechnologies Microsoft 365 Control Panel.

.DESCRIPTION
  Calls scripts/deploy-production.mjs. Prefer Docker on the production host.

.EXAMPLE
  .\scripts\deploy-production.ps1 -Check
  .\scripts\deploy-production.ps1 -GenerateSecret
  .\scripts\deploy-production.ps1 -Docker
  .\scripts\deploy-production.ps1 -Docker -WithBackend
  .\scripts\deploy-production.ps1 -Full
#>
[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$GenerateSecret,
  [switch]$Build,
  [switch]$Start,
  [switch]$Docker,
  [switch]$WithBackend,
  [switch]$Full,
  [switch]$FullDocker,
  [switch]$SkipInstall,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$flags = @()
if ($Help) { $flags += "--help" }
if ($Check) { $flags += "--check" }
if ($GenerateSecret) { $flags += "--generate-secret" }
if ($Build) { $flags += "--build" }
if ($Start) { $flags += "--start" }
if ($Docker) { $flags += "--docker" }
if ($WithBackend) { $flags += "--with-backend" }
if ($Full) { $flags += "--full" }
if ($FullDocker) { $flags += "--full-docker" }
if ($SkipInstall) { $flags += "--skip-install" }

if ($flags.Count -eq 0) { $flags = @("--help") }

Write-Host "netrichtechnologies deploy → node scripts/deploy-production.mjs $($flags -join ' ')" -ForegroundColor Cyan
node "$Root\scripts\deploy-production.mjs" @flags
exit $LASTEXITCODE
