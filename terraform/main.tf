locals {
  site_origin  = "https://${var.domain}"
  redirect_uri = "${local.site_origin}/auth/callback"

  # True once the Google OAuth client exists and both values are supplied.
  # `nonsensitive` is safe: it exposes only whether the values are set.
  google_client_ready = nonsensitive(var.google_oauth_client_id != null && var.google_oauth_client_secret != null)

  # Names must match what src/worker reads off `env` and what the deploy
  # workflow lists under `secrets:` (see outputs.tf: worker_secrets_block).
  # Kept apart from the values so `for_each` never sees a sensitive key set.
  worker_secret_names = sort(concat(
    ["BREVO_API_KEY", "BOARD_ALLOWED_EMAILS", "SESSION_SECRET"],
    local.google_client_ready ? ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] : [],
  ))

  worker_secret_values = {
    BREVO_API_KEY        = var.brevo_api_key
    BOARD_ALLOWED_EMAILS = join(",", var.board_allowed_emails)
    SESSION_SECRET       = random_password.session.result
    GOOGLE_CLIENT_ID     = var.google_oauth_client_id != null ? var.google_oauth_client_id : ""
    GOOGLE_CLIENT_SECRET = var.google_oauth_client_secret != null ? var.google_oauth_client_secret : ""
  }

  # Cloudflare returns TXT content wrapped in quotes and the v5 provider does
  # not normalise it, so unquoted input shows as a permanent diff. Quote here
  # once. If the second `terraform plan` after the first apply is not empty,
  # this is the line to look at (README, "First apply").
  brevo_code_txt = "\"${var.brevo_code}\""
}

data "cloudflare_zone" "this" {
  filter = {
    name = var.domain
  }
}

# ---- DNS: new Brevo records only -------------------------------------------
# Deliberately absent: the apex SPF and the _dmarc record. Both protect live
# church mail and Brevo's guide does not require editing either one.

resource "cloudflare_dns_record" "brevo_code" {
  zone_id = data.cloudflare_zone.this.zone_id
  name    = var.domain
  type    = "TXT"
  content = local.brevo_code_txt
  ttl     = 1 # automatic
  comment = "Brevo domain ownership. Managed by terraform/ in sda-tygerberg-website."
}

resource "cloudflare_dns_record" "brevo_dkim" {
  for_each = var.brevo_dkim_records

  zone_id = data.cloudflare_zone.this.zone_id
  name    = each.value.name
  type    = each.value.type
  content = each.value.type == "TXT" ? "\"${each.value.content}\"" : each.value.content
  ttl     = 1
  proxied = false # DKIM CNAMEs must resolve to Brevo, never to Cloudflare's proxy
  comment = "Brevo DKIM (${each.key}). Managed by terraform/ in sda-tygerberg-website."
}

# ---- Secrets: GitHub Actions -> wrangler-action -> Worker -------------------
# An Actions secret is visible to the workflow, not to the Worker. The deploy
# workflow's `secrets:` block is what uploads each one; outputs.tf prints it.

resource "random_password" "session" {
  length  = 48
  special = false

  keepers = {
    generation = var.session_secret_generation
  }
}

resource "github_actions_secret" "worker" {
  for_each = toset(local.worker_secret_names)

  repository  = var.github_repository
  secret_name = each.key
  value       = local.worker_secret_values[each.key]
}
