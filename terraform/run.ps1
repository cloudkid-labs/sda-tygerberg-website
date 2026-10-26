<#Requires -Version 7.0
<#
.SYNOPSIS
  Wrapper for the board-mail Terraform config: checks the toolchain, ensures
  local-only config exists, then runs init / plan / apply.

.EXAMPLE
  ./run.ps1                 # init (if needed) + apply
  ./run.ps1 -Action plan    # init (if needed) + plan
  ./run.ps1 -Action init    # init only
#>
[CmdletBinding()]
param(
  [ValidateSet('init', 'plan', 'apply', 'unlock')]
  [string]$Action = 'apply',
  # Only for -Action unlock: the lease ID from the lock error. Only use it
  # when the holder is gone (a crashed run on this machine) — unlocking a
  # live apply corrupts state.
  [string]$LockID = ''
)

$ErrorActionPreference = 'Stop'
$RequiredTerraform = [version]'1.17.0'
$TerraformVersion = '1.17.0' # pinned: the version the offline tests pass on

# Every run is transcribed: console + terraform output land in
# logs/run-<timestamp>-<action>.log (gitignored, local only).
$logDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$logFile = Join-Path $logDir ("run-{0:yyyyMMdd-HHmmss}-{1}.log" -f (Get-Date), $Action)
Start-Transcript -Path $logFile | Out-Null
Write-Host "Logging to $logFile"

try {

function Get-TerraformVersion {
  try {
    $out = & terraform version -json 2>$null | ConvertFrom-Json
    return [version]$out.terraform_version
  } catch {
    return $null
  }
}

function Install-Terraform {
  Write-Host "Installing Terraform $TerraformVersion ..."
  $binDir = Join-Path $env:LOCALAPPDATA 'terraform-bin'
  New-Item -ItemType Directory -Force $binDir | Out-Null
  if (-not (Test-Path (Join-Path $binDir 'terraform.exe'))) {
    $zip = Join-Path $binDir 'terraform.zip'
    $url = "https://releases.hashicorp.com/terraform/$TerraformVersion/terraform_${TerraformVersion}_windows_amd64.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $binDir -Force
    Remove-Item $zip -Force
  }
  $env:PATH = "$binDir;$env:PATH"
  # Persist so the next shell (and the next run) finds 1.17 first instead of
  # re-downloading every time. One-time change to your user PATH.
  $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
  if ($userPath -notlike "*$binDir*") {
    [Environment]::SetEnvironmentVariable('PATH', "$binDir;$userPath", 'User')
    Write-Host "Added $binDir to your user PATH (new shells pick it up)."
  }
  Write-Host "Installed to $binDir."
}

$found = Get-TerraformVersion
if (-not $found) {
  Write-Host 'Terraform not found on PATH.'
  Install-Terraform
} elseif ($found -lt $RequiredTerraform) {
  Write-Host "Terraform $found is older than $RequiredTerraform."
  Install-Terraform
} else {
  Write-Host "Terraform $found OK."
}

# Local-only config lives beside this script and never enters git.
foreach ($file in @('backend.hcl', 'terraform.tfvars')) {
  if (-not (Test-Path (Join-Path $PSScriptRoot $file))) {
    throw "Missing $file — copy ${file}.example and fill it in (see README)."
  }
}

# Azure identity is the only credential this backend accepts (no keys).
try {
  az account show --only-show-errors 1>$null
} catch {
  throw 'No Azure session. Run: az login --scope https://management.core.windows.net//.default'
}

# Re-init on every run: cheap when nothing changed, and required whenever the
# backend config changes (a stale .terraform dir means "backend initialization
# required" at plan/apply time). -reconfigure never migrates or loses state.
# Flag forms matter here, verified against both binaries: -backend-config takes
# its path space-separated (-backend-config=path is read as a positional and
# init dies), while booleans use -flag=value (a bare value after -input=false
# would itself be the positional). -reconfigure never migrates or loses state.
Write-Host 'Initialising ...'
& terraform init -backend-config backend.hcl -input=false -reconfigure
if ($LASTEXITCODE -ne 0) { throw 'terraform init failed.' }

switch ($Action) {
  'init' { Write-Host 'Init done.' }
  'unlock' {
    if (-not $LockID) { throw 'Pass -LockID <id> from the lock error.' }
    & terraform force-unlock -force $LockID
    if ($LASTEXITCODE -ne 0) { throw 'force-unlock failed.' }
  }
  'plan' {
    & terraform plan -input=false
    if ($LASTEXITCODE -ne 0) { throw 'terraform plan failed.' }
  }
  'apply' {
    # Approval gate: review the exact plan before anything changes. The saved
    # plan is what gets applied, so what you saw is what runs.
    $planFile = Join-Path $PSScriptRoot 'plan.tfplan'
    & terraform plan -out $planFile -input=false
    if ($LASTEXITCODE -ne 0) { throw 'terraform plan failed.' }
    $answer = Read-Host 'Apply this plan? Type YES to continue'
    if ($answer -ne 'YES') {
      Remove-Item $planFile -Force -ErrorAction SilentlyContinue
      throw 'Apply cancelled — nothing changed.'
    }
    & terraform apply -input=false $planFile
    $applyExit = $LASTEXITCODE
    Remove-Item $planFile -Force -ErrorAction SilentlyContinue
    if ($applyExit -ne 0) { throw 'terraform apply failed.' }
  }
}
} finally {
  Stop-Transcript | Out-Null
}
