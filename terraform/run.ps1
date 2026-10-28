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

# Every input Terraform needs, printed on every run before anything happens.
# Values are never printed — only whether each one is set and where it comes
# from. Secrets travel as TF_VAR_ env vars (never commit them); the rest lives
# in terraform.tfvars (gitignored, local only).
function Show-InputStatus {
  $tfvars = Test-Path (Join-Path $PSScriptRoot 'terraform.tfvars')
  Write-Host ''
  Write-Host 'Inputs Terraform needs this run (values never printed):'
  Write-Host ("  [required] terraform.tfvars present: " + $(if ($tfvars) { 'SET' } else { 'MISSING — cp terraform.tfvars.example terraform.tfvars and fill it in' }))
  foreach ($name in @('brevo_code', 'brevo_dkim_records', 'google_project_id', 'google_oauth_client_id')) {
    $present = $false
    if ($tfvars) {
      $present = (Get-Content (Join-Path $PSScriptRoot 'terraform.tfvars') -Raw) -match "(?m)^\s*#?\s*$name\s*="
    }
    Write-Host ("  [tfvars] $name : " + $(if ($present) { 'SET (or commented out — google_oauth_client_id stays out until the Web client exists)' } else { 'MISSING' }))
  }
  $envStatus = @(
    @{ Name = 'TF_VAR_brevo_api_key'; How = 'Brevo -> Senders, domains & dedicated IPs -> top-right menu -> API Keys' },
    @{ Name = 'TF_VAR_google_oauth_client_secret'; How = 'Google Auth Platform -> Clients -> the Web client -> Client secret (only after the client exists)' },
    @{ Name = 'CLOUDFLARE_API_TOKEN'; How = 'Cloudflare dashboard -> My Profile -> API Tokens (Zone:Read + DNS:Edit on sdatygerberg.co.za only)' },
    @{ Name = 'GITHUB_TOKEN'; How = 'GitHub fine-grained PAT, Secrets read/write on cloudkid-labs/sda-tygerberg-website only' }
  )
  foreach ($e in $envStatus) {
    $set = -not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($e.Name))
    Write-Host ("  [env] $($e.Name): " + $(if ($set) { 'SET' } else { "MISSING — set it: `$env:$($e.Name) = '…'  ($($e.How))" }))
  }
  Write-Host ("  [shell] az login: SET (checked above) + gcloud ADC for the google provider: run 'gcloud auth application-default login --project sda-tygerberg' if Google calls fail")
  Write-Host ''
}
Show-InputStatus

# Init only when needed: -reconfigure reinstalls every provider binary on each
# run, and the rewrite races the plan step that follows — the provider exe ends
# up locked and the run dies. Plain init is idempotent and cheap when nothing
# changed; -reconfigure is reserved for a missing .terraform dir or an edited
# backend.hcl (a stale dir otherwise means "backend initialization required").
Write-Host 'Initialising ...'
$terraformDir = Join-Path $PSScriptRoot '.terraform'
$backendFile = Join-Path $PSScriptRoot 'backend.hcl'
$needReconfigure = (-not (Test-Path $terraformDir)) -or ((Get-Item $backendFile).LastWriteTime -gt (Get-Item $terraformDir).LastWriteTime)
if ($needReconfigure) {
  & terraform init -backend-config backend.hcl -input=false -reconfigure
} else {
  & terraform init -backend-config backend.hcl -input=false
}
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
    # plan is what gets applied, so what you saw is what runs. No diff, no
    # gate: a clean plan reports and stops without asking.
    $planFile = Join-Path $PSScriptRoot 'plan.tfplan'
    & terraform plan -detailed-exitcode -out $planFile -input=false
    $planExit = $LASTEXITCODE
    if ($planExit -eq 0) {
      Remove-Item $planFile -Force -ErrorAction SilentlyContinue
      Write-Host 'No changes. Infrastructure matches the configuration — nothing to approve.'
    } elseif ($planExit -eq 2) {
      $answer = Read-Host 'Apply this plan? Type YES to continue'
      if ($answer -ne 'YES') {
        Remove-Item $planFile -Force -ErrorAction SilentlyContinue
        throw 'Apply cancelled — nothing changed.'
      }
      & terraform apply -input=false $planFile
      $applyExit = $LASTEXITCODE
      Remove-Item $planFile -Force -ErrorAction SilentlyContinue
      if ($applyExit -ne 0) { throw 'terraform apply failed.' }
    } else {
      Remove-Item $planFile -Force -ErrorAction SilentlyContinue
      throw 'terraform plan failed.'
    }
  }
}
} finally {
  Stop-Transcript | Out-Null
}
