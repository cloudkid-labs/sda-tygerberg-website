# Non-blocking assertions that surface in `terraform plan` output.

check "production_origin_is_https" {
  assert {
    condition     = startswith(local.redirect_uri, "https://")
    error_message = "The production redirect URI must be https; Google rejects plain http outside localhost."
  }
}

check "dkim_targets_are_brevo" {
  assert {
    condition = alltrue([
      for r in values(var.brevo_dkim_records) :
      r.type == "TXT" || can(regex("brevo", lower(r.content)))
    ])
    error_message = "A DKIM CNAME does not point at a brevo host. Re-copy it from the Brevo domain page."
  }
}

check "branding_targets_are_brevo" {
  assert {
    condition     = alltrue([for r in values(var.brevo_branding_cnames) : can(regex("brevo", lower(r.target)))])
    error_message = "A branding CNAME does not point at a brevo host. Re-copy it from the Brevo domain page."
  }
}

check "google_client_present" {
  assert {
    condition     = local.google_client_ready
    error_message = "The Google OAuth client is not set yet. The Worker's /auth routes answer not-configured until you create the client and apply again."
  }
}
