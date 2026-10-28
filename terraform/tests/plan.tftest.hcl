# Offline: every provider is mocked, so this needs no credentials and touches
# nothing. Run with `terraform test`.

mock_provider "cloudflare" {}
mock_provider "github" {}
mock_provider "google" {}
mock_provider "random" {}

variables {
  google_project_id = "sda-tygerberg-klerk"
  brevo_code        = "brevo-code:0123456789abcdef"
  brevo_api_key     = "xkeysib-0000000000000000000000000000"
  brevo_dkim_records = {
    dkim1 = { type = "CNAME", name = "brevo1._domainkey", content = "b1.sdatygerberg-co-za.dkim.brevo.com" }
    dkim2 = { type = "CNAME", name = "brevo2._domainkey", content = "b2.sdatygerberg-co-za.dkim.brevo.com" }
  }
  google_oauth_client_id     = "123456789012-abcdefghij.apps.googleusercontent.com"
  google_oauth_client_secret = "GOCSPX-0000000000000000000000000000"
}

run "creates_brevo_dns_and_all_four_secrets" {
  command = plan

  assert {
    condition     = length(cloudflare_dns_record.brevo_dkim) == 2
    error_message = "Expected one DNS record per DKIM entry."
  }

  assert {
    condition     = cloudflare_dns_record.brevo_code.type == "TXT" && startswith(cloudflare_dns_record.brevo_code.content, "\"")
    error_message = "Brevo code must be a quoted TXT record."
  }

  assert {
    condition     = alltrue([for r in cloudflare_dns_record.brevo_dkim : r.proxied == false])
    error_message = "DKIM CNAMEs must not be proxied."
  }

  assert {
    condition = toset(keys(github_actions_secret.worker)) == toset([
      "BREVO_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET",
    ])
    error_message = "The Worker secret names drifted from what the Worker reads."
  }
}

run "creates_brevo_tracking_cname_unproxied" {
  command = plan

  variables {
    brevo_tracking_cname = { name = "r.mail", target = "track.brevo.com" }
  }

  assert {
    condition     = length(cloudflare_dns_record.brevo_tracking) == 1
    error_message = "Expected one tracking CNAME."
  }

  assert {
    condition     = cloudflare_dns_record.brevo_tracking[0].type == "CNAME" && cloudflare_dns_record.brevo_tracking[0].proxied == false
    error_message = "The tracking CNAME must be unproxied so it resolves to Brevo."
  }
}

run "oauth_setup_output_is_exact" {
  command = plan

  assert {
    condition     = contains(output.google_oauth_client_setup.authorized_redirect_uris, "https://sdatygerberg.co.za/auth/callback")
    error_message = "Production redirect URI missing."
  }

  assert {
    condition     = contains(output.google_oauth_client_setup.authorized_redirect_uris, "http://localhost:8787/auth/callback")
    error_message = "wrangler dev redirect URI missing."
  }

  assert {
    condition     = !anytrue([for u in output.google_oauth_client_setup.authorized_javascript_origins : endswith(u, "/")])
    error_message = "Google origins must not carry a trailing slash."
  }
}

run "rejects_malformed_google_client_id" {
  command = plan

  variables {
    google_oauth_client_id = "not-a-client-id"
  }

  expect_failures = [var.google_oauth_client_id]
}

run "rejects_non_dkim_record_type" {
  command = plan

  variables {
    brevo_dkim_records = {
      bad = { type = "A", name = "x", content = "1.2.3.4" }
    }
  }

  expect_failures = [var.brevo_dkim_records]
}

run "creates_protected_google_project" {
  command = plan

  assert {
    condition     = google_project.this.project_id == "sda-tygerberg-klerk" && google_project.this.deletion_policy == "PREVENT"
    error_message = "The Google project must exist and be protected from accidental destroy."
  }

  assert {
    condition     = google_project.this.auto_create_network == false
    error_message = "No default network should be created."
  }
}

run "first_apply_before_the_oauth_client_exists" {
  command = plan

  variables {
    google_oauth_client_id     = null
    google_oauth_client_secret = null
  }

  assert {
    condition     = toset(keys(github_actions_secret.worker)) == toset(["BREVO_API_KEY", "SESSION_SECRET"])
    error_message = "Without a client, only the two non-Google secrets are written."
  }

  # The check block warns that Google sign-in is not configured yet.
  expect_failures = [check.google_client_present]
}

run "rejects_half_configured_google_client" {
  command = plan

  variables {
    google_oauth_client_secret = null
  }

  expect_failures = [var.google_oauth_client_id]
}

run "rejects_bad_google_project_id" {
  command = plan

  variables {
    google_project_id = "Bad_ID"
  }

  expect_failures = [var.google_project_id]
}
