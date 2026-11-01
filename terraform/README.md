# terraform

Manages the infrastructure behind the members area (`/members`: board mail and the CMS): Brevo DNS
records on `sdatygerberg.co.za` and the Worker's deploy secrets in GitHub
Actions. Spec: *Church Board Mail via Google Sign-in: Implementation Spec*.

| Resource | Purpose |
|---|---|
| `cloudflare_dns_record.brevo_code`, `.brevo_dkim` | Brevo domain ownership and DKIM |
| `google_project.this` | New Google Cloud project that holds the OAuth consent screen and client (protected from destroy) |
| `random_password.session` | `SESSION_SECRET`, signs the board session cookie |
| `github_actions_secret.worker` | `BREVO_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` |
| `cloudflare_r2_bucket.cms`, `.cms_devtest` | Members-area CMS content and images (`tygerberg-cms`, `tygerberg-cms-devtest`), bound as `CMS` in `wrangler.jsonc` — C-70 |
| `random_password.session_devtest`, `github_actions_secret.devtest_session` | `DEVTEST_SESSION_SECRET`, the devtest preview's own session key, uploaded as its `SESSION_SECRET` by the devtest workflow — C-70 |

## Not managed here

- **The Google consent screen and OAuth client.** No Terraform resource creates
  a Sign in with Google Web client: `google_iam_oauth_client` is Workforce
  Identity Federation only, and `google_iap_brand` can only make an Internal
  consent screen. Create both by hand in the project Terraform made;
  `terraform output google_oauth_client_setup` prints the exact origins and
  redirect URIs to paste.
- **Apex SPF and `_dmarc`.** They protect live church mail. Brevo's guide does
  not require editing either.
- **The Worker, routes and non-secret vars.** `wrangler.jsonc` owns those.

## Bootstrap (once)

1. Use `protecteddatabackups` with its private `sda-tygerberg` container (no public
   access, shared-key access disabled, blob versioning on, soft delete on), and
   grant yourself **Storage Blob Data Contributor** on the container. Use a
   subscription you own, not an employer's.
2. `cp backend.hcl.example backend.hcl`, fill in `resource_group_name` (tenant, subscription and storage account are prefilled; the container is `sda-tygerberg`).
3. `az login` and `gcloud auth application-default login`, then export `CLOUDFLARE_API_TOKEN` (Zone:Read + DNS:Edit on this
   zone only, plus Account → Workers R2 Storage:Edit for the CMS buckets) and `GITHUB_TOKEN` (fine-grained, Secrets read/write on this repo only).
4. `terraform init -backend-config=backend.hcl`

## First apply

1. In Brevo add and authenticate `sdatygerberg.co.za`; copy the Brevo code and DKIM records.
2. `cp terraform.tfvars.example terraform.tfvars` and fill it in, leaving the two
   Google client values out. Pass the Brevo key as `TF_VAR_brevo_api_key`.
3. `terraform plan`, then `terraform apply`. This creates the Google project, the
   DNS records and two secrets.
4. In the new project, open Google Auth Platform and create the consent screen and the
   Web client (spec, "Manual steps"). Copy its id and secret.
5. Add `google_oauth_client_id` to `terraform.tfvars`, export
   `TF_VAR_google_oauth_client_secret`, and `terraform apply` again. This adds the last two secrets.
6. Run `terraform plan`. It must be empty. A diff on a TXT record means the
   quoting in `main.tf` (`local.brevo_code_txt`, the DKIM `content`) is wrong for your provider version.
7. Add the names from `terraform output worker_secrets_block` to the deploy workflow.

## Devtest sign-in (C-70)

The preview at `tygerberg-sda.cloudkid.link` signs in to `/members` with the
**same** Google OAuth client as production and its **own** session key, so a
preview session never verifies on production.

1. `terraform apply` — creates `DEVTEST_SESSION_SECRET` (and the CMS buckets).
2. In Google Auth Platform → Clients → the Web client, add what
   `terraform output google_oauth_client_setup` now lists for devtest:
   origin `https://tygerberg-sda.cloudkid.link`, redirect URI
   `https://tygerberg-sda.cloudkid.link/auth/callback`. If Google asks, add
   `cloudkid.link` under Branding → Authorized domains.
3. Re-run *Deploy devtest (Cloudflare)*; it uploads `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` (from `DEVTEST_SESSION_SECRET`).

Who may sign in is `BOARD_*` in `wrangler.jsonc` `env.devtest.vars`, kept equal
to production's by a test. The preview never sends mail: no Brevo key, no
`MAIL_SEND_FROM`.

## CMS buckets (C-70)

`r2.tf` creates the two buckets the members-area CMS stores content in. Apply it
**before** the Worker deploy that binds them — `wrangler deploy` fails against a
missing bucket. Production binds `tygerberg-cms`, devtest `tygerberg-cms-devtest`. Existing buckets made by
hand (`consent-cloudkid-link`, `tygerberg-submissions*`) stay outside Terraform,
as C-69 records; only the new ones are managed here.

## run.ps1

`./run.ps1` (apply), `-Action plan`, `-Action destroy`, `-Action init`. Each
terraform step runs once — no retries — and its output is shown and logged to
`logs/`. apply and destroy save the plan, print what it creates, changes and
destroys, and apply that exact plan only after you type `yes` (any case) — or `DESTROY`, exactly,
for a destroy or any plan that deletes something. `-AutoApprove` never
approves a deletion. Before any terraform call it checks that tokens carry no
whitespace or quotes and that `cloudflare_account_id` is a 32-hex id, not a
token.

## Checks

`terraform fmt -check -recursive`, `terraform validate`, `terraform test`.
The tests mock every provider: no credentials, nothing is touched.

## Caveats

- State holds every secret in plain text. Keep the container private; never commit `terraform.tfvars` or `backend.hcl`.
- Rotating `session_secret_generation` signs every board member out.
- `terraform destroy` stops at `google_project.this` (`deletion_policy = "PREVENT"`). Project ids cannot be reused.
- Creating a project with Application Default Credentials needs the Cloud Resource Manager API reachable from your gcloud client; if it errors, enable it on the project gcloud names.
- State is locked by an Azure blob lease; a stuck lock is cleared with `terraform force-unlock`.
