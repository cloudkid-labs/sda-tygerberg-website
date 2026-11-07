#Requires -Version 7.2
<#
.SYNOPSIS
  Wrapper for the members-area Terraform config: checks the toolchain, ensures
  local-only config exists, then runs init / plan / apply.

.DESCRIPTION
  apply and destroy always stop at an approval gate after the plan: the
  script counts what the saved plan creates, changes and destroys, names every
  resource it would destroy, and applies that exact plan only after you type
  the confirmation word — yes (any case) for a plan that destroys nothing, DESTROY (exact) for a
  destroy or any plan that deletes a resource.

.EXAMPLE
  ./run.ps1                    # init (if needed) + plan + approval + apply
  ./run.ps1 -Action plan       # init (if needed) + plan only, changes nothing
  ./run.ps1 -Action init       # init only
  ./run.ps1 -Action destroy    # init + destroy plan + DESTROY approval + apply
#>
[CmdletBinding()]
param(
  [ValidateSet('init', 'plan', 'apply', 'destroy', 'unlock')]
  [string]$Action = 'apply',
  # Only for -Action unlock: the lease ID from the lock error. Only use it
  # when the holder is gone (a crashed run on this machine) — unlocking a
  # live apply corrupts state.
  [string]$LockID = '',
  # Non-interactive apply (CI): skips the YES prompt for a plan that destroys
  # nothing. It never approves a destroy, or any plan that deletes a resource.
  [switch]$AutoApprove
)

$ErrorActionPreference = 'Stop'
# A native command's exit code is checked explicitly below, never turned into
# an exception: with this $true (the default in some 7.x setups), a plan that
# exits 2 — "changes present", not an error — would throw.
$PSNativeCommandUseErrorActionPreference = $false
# Terraform writes UTF-8. Piped through PowerShell (Invoke-Terraform does),
# its bytes are decoded with [Console]::OutputEncoding, which on Windows is the
# OEM code page (437): the plan separator U+2500 '─' (E2 94 80) then shows as
# 'ΓöÇ'. Decode as UTF-8 for this run; the original is restored in finally.
$originalOutputEncoding = [Console]::OutputEncoding
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
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

  # Values that would otherwise fail deep inside a provider with an unhelpful
  # message. Checked by shape only; no value is ever printed.
  function Test-InputShapes {
    # A token with a trailing newline, a surrounding quote or an inner space is
    # an invalid HTTP header — the provider reports only `invalid header field
    # value for "Authorization"`. Surrounding whitespace is trimmed for this
    # run; anything else stops the run.
    foreach ($name in @('CLOUDFLARE_API_TOKEN', 'GITHUB_TOKEN', 'TF_VAR_brevo_api_key', 'TF_VAR_google_oauth_client_secret')) {
      $value = [Environment]::GetEnvironmentVariable($name)
      if ([string]::IsNullOrEmpty($value)) { continue }
      $trimmed = $value.Trim()
      if ($trimmed -ne $value) {
        [Environment]::SetEnvironmentVariable($name, $trimmed)
        Write-Host "  [fix] $name had surrounding whitespace or a newline — trimmed for this run. Re-set it without one."
      }
      if ($trimmed -match '^(?i:bearer)\s') {
        throw "$name starts with 'Bearer '. Set the token itself; the provider adds the scheme."
      }
      if ($trimmed -notmatch '^[\x21-\x7E]+$') {
        throw "$name contains spaces, quotes or non-printable characters. Re-set it: `$env:$name = '<token>' (value not shown)."
      }
      if ($trimmed -match '^["''].*["'']$') {
        throw "$name is wrapped in quotes. Re-set it without them (value not shown)."
      }
    }

    # cloudflare_account_id is an identifier: 32 hex characters, from the
    # dashboard's Overview page. Anything token-shaped there is a credential in
    # the wrong field — and it would be printed in every plan.
    # Every source Terraform reads is checked: the env var, then each *.tfvars
    # file here (terraform.tfvars and *.auto.tfvars are both loaded). The
    # saved plan is checked again at the approval gate, whatever the source.
    $sources = @()
    $envValue = [Environment]::GetEnvironmentVariable('TF_VAR_cloudflare_account_id')
    if (-not [string]::IsNullOrEmpty($envValue)) { $sources += [pscustomobject]@{ Where = 'env TF_VAR_cloudflare_account_id'; Value = $envValue.Trim().Trim('"') } }
    foreach ($file in @(Get-ChildItem -Path $PSScriptRoot -Filter '*.tfvars' -File -ErrorAction SilentlyContinue) + @(Get-ChildItem -Path $PSScriptRoot -Filter '*.auto.tfvars.json' -File -ErrorAction SilentlyContinue)) {
      foreach ($m in @(Select-String -Path $file.FullName -Pattern '^\s*"?cloudflare_account_id"?\s*[=:]\s*"?([^"\s,]*)"?')) {
        $sources += [pscustomobject]@{ Where = $file.Name; Value = $m.Matches[0].Groups[1].Value }
      }
    }
    foreach ($src in $sources) { Assert-AccountIdShape -Value $src.Value -Where $src.Where }
  }

  function Assert-AccountIdShape {
    param([string]$Value, [string]$Where)
    if ($Value -match '^(cfat_|cfut_|cfk_)' -or ($Value -notmatch '^[0-9a-f]{32}$' -and $Value.Length -ge 37)) {
      throw "cloudflare_account_id ($Where) holds what looks like an API TOKEN, not the account id. Replace it with the 32-hex Account ID (dashboard -> Overview), and roll that token in Cloudflare (My Profile -> API Tokens): it has been printed in plan output."
    }
    if ($Value -notmatch '^[0-9a-f]{32}$') {
      throw "cloudflare_account_id ($Where) must be the 32-character hex Account ID (dashboard -> Overview)."
    }
  }
  Test-InputShapes

  # Runs one terraform step, once, and returns ONLY its exit code. No retry:
  # a failure stops the run so its error is the last thing on screen.
  #
  # Everything terraform prints — stdout and stderr — goes straight to the
  # console (and so into the transcript) through Out-Host. It must never reach
  # this function's output: PowerShell returns every uncaptured line from a
  # function, so the caller would get an array of text plus the code, and
  # `-ne 0` on that array is always truthy — the run would report failure even
  # when terraform succeeded, with the real message swallowed.
  function Invoke-Terraform {
    param([scriptblock]$Step)
    # Local to this function: stderr lines are output to show, not errors.
    $ErrorActionPreference = 'Continue'
    & $Step 2>&1 | ForEach-Object { "$_" } | Out-Host
    return [int]$LASTEXITCODE
  }

  # The approval gate for apply and destroy. Reads the SAVED plan — the exact
  # thing that will be applied — and counts its actions from the JSON form,
  # which is parsed in memory and never printed (it can hold sensitive values).
  # Returns only when approved; throws otherwise.
  function Confirm-SavedPlan {
    param([string]$PlanPath, [ValidateSet('apply', 'destroy')][string]$Kind)
    $ErrorActionPreference = 'Continue'
    $json = & terraform show -json $PlanPath 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $json) { throw 'Could not read the saved plan for approval — nothing applied.' }
    $plan = ($json -join "`n") | ConvertFrom-Json -Depth 100
    $creates = @(); $updates = @(); $deletes = @()
    foreach ($rc in @($plan.resource_changes)) {
      if (-not $rc) { continue }
      $actions = @($rc.change.actions)
      if ($actions -contains 'delete') { $deletes += $rc.address }
      if ($actions -contains 'create') { $creates += $rc.address }
      if ($actions -contains 'update') { $updates += $rc.address }
    }
    # Source-agnostic backstop: any Cloudflare resource whose planned
    # account_id is not a 32-hex id is refused before the prompt (value never
    # printed — it is usually a token pasted into the wrong field).
    foreach ($rc in @($plan.resource_changes)) {
      if (-not $rc -or $rc.type -notlike 'cloudflare_*') { continue }
      $after = $rc.change.after
      if ($after -and $after.PSObject.Properties.Name -contains 'account_id' -and $after.account_id) {
        Assert-AccountIdShape -Value ([string]$after.account_id) -Where "planned for $($rc.address)"
      }
    }
    $needsDestroyWord = ($Kind -eq 'destroy') -or ($deletes.Count -gt 0)
    $word = if ($needsDestroyWord) { 'DESTROY' } else { 'YES' }

    Write-Host ''
    Write-Host '================ APPROVAL REQUIRED ================'
    Write-Host ("  Action:  terraform {0} (the saved plan above, exactly)" -f $(if ($Kind -eq 'destroy') { 'destroy' } else { 'apply' }))
    Write-Host ("  Create:  {0}" -f $creates.Count)
    foreach ($a in $creates) { Write-Host "             + $a" }
    Write-Host ("  Change:  {0}" -f $updates.Count)
    foreach ($a in $updates) { Write-Host "             ~ $a" }
    Write-Host ("  Destroy: {0}" -f $deletes.Count)
    foreach ($a in $deletes) { Write-Host "             - $a" }
    Write-Host '==================================================='

    if ($AutoApprove) {
      if ($needsDestroyWord) { throw '-AutoApprove never approves a destroy or a plan that deletes resources. Run interactively.' }
      Write-Host 'Approved by -AutoApprove (no deletions in this plan).'
      return
    }
    # Apply accepts yes in any case; a destroy (or any deletion) still needs
    # DESTROY exactly, so a reflexive 'yes' never removes resources.
    $prompt = if ($needsDestroyWord) { "Type $word to continue, anything else cancels" } else { 'Type yes to continue, anything else cancels' }
    $answer = ([string](Read-Host $prompt)).Trim()
    $approved = if ($needsDestroyWord) { $answer -ceq $word } else { $answer -ieq 'yes' }
    if (-not $approved) { throw 'Not approved — nothing changed.' }
    Write-Host 'Approved.'
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
  $initExit = Invoke-Terraform { & terraform @initArgs }
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
      $unlockExit = Invoke-Terraform { & terraform force-unlock -force $LockID }
      if ($unlockExit -ne 0) { throw 'force-unlock failed.' }
    }
    'plan' {
      $planOnlyExit = Invoke-Terraform { & terraform plan -input=false }
      if ($planOnlyExit -ne 0) { throw "terraform plan failed (exit $planOnlyExit). Full output: $logFile" }
    }
    { $_ -in @('apply', 'destroy') } {
      # Plan to a file, gate on that file, apply that file: what you approved
      # is exactly what runs. No diff, no gate — a clean plan stops here.
      $planFile = Join-Path $PSScriptRoot 'plan.tfplan'
      if ($Action -eq 'destroy') {
        $planExit = Invoke-Terraform { & terraform plan -destroy -detailed-exitcode -out $planFile -input=false }
      } else {
        $planExit = Invoke-Terraform { & terraform plan -detailed-exitcode -out $planFile -input=false }
      }
      if ($planExit -eq 0) {
        Write-Host 'No changes. Infrastructure matches the configuration — nothing to approve.'
      } elseif ($planExit -eq 2) {
        Confirm-SavedPlan -PlanPath $planFile -Kind $Action
        $applyExit = Invoke-Terraform { & terraform apply -input=false $planFile }
        if ($applyExit -ne 0) { throw "terraform $Action failed (exit $applyExit). Full output: $logFile" }
      } else {
        throw "terraform plan failed (exit $planExit). The terraform error is printed above. Full output: $logFile"
      }
    }
  }
} finally {
  if ($planFile -and (Test-Path $planFile)) { Remove-Item $planFile -Force -ErrorAction SilentlyContinue }
  Pop-Location
  Stop-Transcript | Out-Null
  [Console]::OutputEncoding = $originalOutputEncoding
}
