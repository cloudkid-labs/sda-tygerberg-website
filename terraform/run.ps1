#Requires -Version 7.2
<#
.SYNOPSIS
  Wrapper for the members-area Terraform config: checks the toolchain, ensures
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
  [string]$LockID = '',
  # Non-interactive apply (CI): skips the YES prompt. Only pass a reviewed plan.
  [switch]$AutoApprove
)

$ErrorActionPreference = 'Stop'
# A native command's exit code is checked explicitly below, never turned into
# an exception: with this $true (the default in some 7.x setups), a plan that
# exits 2 — "changes present", not an error — would throw.
$PSNativeCommandUseErrorActionPreference = $false
$RequiredTerraform = [version]'1.17.0'
$TerraformVersion = '1.17.0' # pinned: the version the offline tests pass on

# Every run is transcribed: console + terraform output land in
# logs/run-<timestamp>-<action>.log (gitignored, local only).
$logDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$logFile = Join-Path $logDir ("run-{0:yyyyMMdd-HHmmss}-{1}.log" -f (Get-Date), $Action)
Start-Transcript -Path $logFile | Out-Null
Write-Host "Logging to $logFile"

# Run from anywhere: terraform resolves config and -backend-config against the
# working directory, so anchor it to this script's directory.
Push-Location $PSScriptRoot

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
  # A native command does not throw on failure, so check its exit code — a
  # try/catch around `az` could never fire.
  az account show --only-show-errors --output none
  if ($LASTEXITCODE -ne 0) {
    throw 'No Azure session. Run: az login --scope https://management.core.windows.net//.default'
  }
  # The google provider (plan/apply) authenticates with Application Default
  # Credentials. Not needed for init or unlock.
  if ($Action -in @('plan', 'apply')) {
    gcloud auth application-default print-access-token 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw 'No Google ADC. Run: gcloud auth application-default login'
    }
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
    foreach ($name in @('brevo_code', 'brevo_dkim_records', 'google_project_id', 'google_oauth_client_id', 'cloudflare_account_id')) {
      $status = 'MISSING'
      if ($tfvars) {
        $content = Get-Content (Join-Path $PSScriptRoot 'terraform.tfvars') -Raw
        if ($content -match "(?m)^\s*$name\s*=") { $status = 'SET' }
        elseif ($content -match "(?m)^\s*#\s*$name\s*=") { $status = 'COMMENTED-OUT' }
      }
      $note = ''
      if ($name -eq 'google_oauth_client_id' -and $status -ne 'SET') { $note = ' (stays out until the Web client exists)' }
      if ($name -eq 'cloudflare_account_id' -and $status -ne 'SET') { $note = ' (required for the CMS buckets in r2.tf — Cloudflare dashboard -> Overview -> Account ID)' }
      Write-Host ("  [tfvars] $name : " + $status + $note)
    }
    $envStatus = @(
      @{ Name = 'TF_VAR_brevo_api_key'; How = 'Brevo -> Senders, domains & dedicated IPs -> top-right menu -> API Keys' },
      @{ Name = 'TF_VAR_google_oauth_client_secret'; How = 'Google Auth Platform -> Clients -> the Web client -> Client secret (only after the client exists)' },
      @{ Name = 'CLOUDFLARE_API_TOKEN'; How = 'Cloudflare dashboard -> My Profile -> API Tokens (Zone:Read + DNS:Edit on sdatygerberg.co.za, plus Account: Workers R2 Storage:Edit for the CMS buckets)' },
      @{ Name = 'GITHUB_TOKEN'; How = 'GitHub fine-grained PAT, Secrets read/write on cloudkid-labs/sda-tygerberg-website only' }
    )
    foreach ($e in $envStatus) {
      $set = -not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($e.Name))
      Write-Host ("  [env] $($e.Name): " + $(if ($set) { 'SET' } else { "MISSING — set it: `$env:$($e.Name) = '…'  ($($e.How))" }))
    }
    Write-Host '  [shell] az login: SET (checked above); gcloud ADC: checked above for plan/apply'
    Write-Host ''
  }
  Show-InputStatus

  # Runs one terraform step and returns ONLY its exit code.
  #
  # Everything terraform prints — stdout and stderr — goes straight to the
  # console (and so into the transcript) through Out-Host. It must never reach
  # this function's output: PowerShell returns every uncaptured line from a
  # function, so the caller would get an array of text plus the code, and
  # `-ne 0` on that array is always truthy — the run would report failure even
  # when terraform succeeded, with the real message swallowed.
  #
  # Transient file locks (AV scan on a fresh provider exe, stale handle) can fail
  # an init/plan/apply that would succeed seconds later. Plan is read-only and
  # apply is state-guarded, so a bounded retry is safe. Only exit code 1
  # (error) retries: 0 and plan's 2 (changes present) return immediately.
  function Invoke-TerraformWithRetry {
    param([scriptblock]$Step)
    # Local to this function: stderr lines are output to show, not errors.
    $ErrorActionPreference = 'Continue'
    $code = 1
    for ($attempt = 1; $attempt -le 3 -and $code -eq 1; $attempt++) {
      if ($attempt -gt 1) {
        Write-Host "Attempt $attempt/3 after a 5s pause..."
        Start-Sleep -Seconds 5
      }
      & $Step 2>&1 | ForEach-Object { "$_" } | Out-Host
      $code = $LASTEXITCODE
    }
    return [int]$code
  }

  # Reconfigure only when the backend config actually changed: -reconfigure
  # rewrites the working dir just before plan runs, and a transient lock on a
  # fresh file kills the run. A content hash of backend.hcl decides, not its
  # mtime, so timestamp-only touches skip the reinstall while real edits always
  # reconfigure. The hash is recorded only after a successful reconfigure, so a
  # failed run retries it next time instead of falling through to plain init.
  # Flag forms matter here: -backend-config takes its path space-separated
  # (-backend-config=path is read as a positional and init dies).
  Write-Host 'Initialising ...'
  $terraformDir = Join-Path $PSScriptRoot '.terraform'
  $backendFile = Join-Path $PSScriptRoot 'backend.hcl'
  $hashFile = Join-Path $terraformDir '.backend-hcl.sha256'
  $currentHash = (Get-FileHash $backendFile -Algorithm SHA256).Hash
  $needReconfigure = (-not (Test-Path $terraformDir -PathType Container)) -or (-not (Test-Path $hashFile -PathType Leaf)) -or ((Get-Content $hashFile -Raw).Trim() -ne $currentHash)
  $initArgs = @('init', '-backend-config', $backendFile, '-input=false')
  if ($needReconfigure) { $initArgs += '-reconfigure' }
  $initExit = Invoke-TerraformWithRetry { & terraform @initArgs }
  if ($initExit -ne 0) {
    Write-Host ''
    Write-Host 'Common init causes (the terraform error is printed above):'
    Write-Host '  403 / AuthorizationPermissionMismatch -> your az identity needs Storage Blob Data Contributor on the sda-tygerberg container;'
    Write-Host '                                           also: az account set --subscription "SDA Tygerberg"'
    Write-Host '  AADSTS / token expired                -> az login --scope https://storage.azure.com/.default'
    Write-Host '  file in use / failed to install       -> close VS Code (its Terraform extension locks provider files), delete .terraform, re-run'
    throw "terraform init failed (exit $initExit). Full output: $logFile"
  }
  if ($needReconfigure) { $currentHash | Set-Content $hashFile -NoNewline }

  $planFile = $null
  switch ($Action) {
    'init' { Write-Host 'Init done.' }
    'unlock' {
      if (-not $LockID) { throw 'Pass -LockID <id> from the lock error.' }
      $unlockExit = Invoke-TerraformWithRetry { & terraform force-unlock -force $LockID }
      if ($unlockExit -ne 0) { throw 'force-unlock failed.' }
    }
    'plan' {
      $planOnlyExit = Invoke-TerraformWithRetry { & terraform plan -input=false }
      if ($planOnlyExit -ne 0) { throw "terraform plan failed (exit $planOnlyExit). Full output: $logFile" }
    }
    'apply' {
      # Approval gate: review the exact plan before anything changes. The saved
      # plan is what gets applied, so what you saw is what runs. No diff, no
      # gate: a clean plan reports and stops without asking.
      $planFile = Join-Path $PSScriptRoot 'plan.tfplan'
      $planExit = Invoke-TerraformWithRetry { & terraform plan -detailed-exitcode -out $planFile -input=false }
      if ($planExit -eq 0) {
        Remove-Item $planFile -Force -ErrorAction SilentlyContinue
        Write-Host 'No changes. Infrastructure matches the configuration — nothing to approve.'
      } elseif ($planExit -eq 2) {
        if (-not $AutoApprove) {
          $answer = Read-Host 'Apply this plan? Type YES to continue'
          if ($answer -ne 'YES') {
            Remove-Item $planFile -Force -ErrorAction SilentlyContinue
            $planFile = $null
            throw 'Apply cancelled — nothing changed.'
          }
        }
        $applyExit = Invoke-TerraformWithRetry { & terraform apply -input=false $planFile }
        Remove-Item $planFile -Force -ErrorAction SilentlyContinue
        if ($applyExit -ne 0) { throw "terraform apply failed (exit $applyExit). Full output: $logFile" }
      } else {
        Remove-Item $planFile -Force -ErrorAction SilentlyContinue
        throw "terraform plan failed (exit $planExit). Full output: $logFile"
      }
    }
  }
} finally {
  if ($planFile -and (Test-Path $planFile)) { Remove-Item $planFile -Force -ErrorAction SilentlyContinue }
  Pop-Location
  Stop-Transcript | Out-Null
}
