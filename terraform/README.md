# terraform

Manages the infrastructure behind the church board mail page (`/kerkraad`): Brevo DNS
records on `sdatygerberg.co.za` and the Worker's deploy secrets in GitHub
Actions. Spec: *Church Board Mail via Google Sign-in: Implementation Spec*.

| Resource | Purpose |
|---|---|
| `cloudflare_dns_record.brevo_code`, `.brevo_dkim` | Brevo domain ownership and DKIM |
| `google_project.this` | New Google Cloud project that holds the OAuth consent screen and client (protected from destroy) |
| `random_password.session` | `SESSION_SECRET`, signs the board session cookie |
| `github_actions_secret.worker` | `BREVO_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` |

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
   zone only) and `GITHUB_TOKEN` (fine-grained, Secrets read/write on this repo only).
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

## Checks

`terraform fmt -check -recursive`, `terraform validate`, `terraform test`.
The tests mock every provider: no credentials, nothing is touched.

## Caveats

- State holds every secret in plain text. Keep the container private; never commit `terraform.tfvars` or `backend.hcl`.
- Rotating `session_secret_generation` signs every board member out.
- `terraform destroy` stops at `google_project.this` (`deletion_policy = "PREVENT"`). Project ids cannot be reused.
- Creating a project with Application Default Credentials needs the Cloud Resource Manager API reachable from your gcloud client; if it errors, enable it on the project gcloud names.
- State is locked by an Azure blob lease; a stuck lock is cleared with `terraform force-unlock`.
