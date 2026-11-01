output "google_oauth_client_setup" {
  description = "Paste these into the OAuth client in Google Auth Platform (Clients -> Web application)."
  value = {
    authorized_javascript_origins = local.oauth_origins
    authorized_redirect_uris      = [for o in local.oauth_origins : "${o}/auth/callback"]
    scopes                        = ["openid", "email"]
  }
}

output "worker_secrets_block" {
  description = "The `secrets:` input for cloudflare/wrangler-action in .github/workflows/deploy-production-cloudflare.yml. Add alongside YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID, and list each in the step's `env:` too."
  value       = join("\n", local.worker_secret_names)
}

output "dns_records" {
  description = "What this configuration created in the zone."
  value = merge(
    { brevo_code = "TXT ${var.domain}" },
    { for k, r in cloudflare_dns_record.brevo_dkim : "dkim_${k}" => "${r.type} ${r.name}" },
  )
}

output "google_project" {
  description = "The project that holds the OAuth consent screen and client."
  value = {
    project_id = google_project.this.project_id
    number     = google_project.this.number
  }
}
