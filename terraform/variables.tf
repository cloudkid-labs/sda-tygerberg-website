variable "domain" {
  description = "Zone the church mail is sent from. Must already exist in the Cloudflare account."
  type        = string
  default     = "sdatygerberg.co.za"
}

variable "github_owner" {
  description = "GitHub user or organisation that owns the website repository."
  type        = string
  default     = "cloud-technologist"
}

variable "github_repository" {
  description = "Repository whose Actions secrets feed the Worker deploy."
  type        = string
  default     = "sda-tygerberg-website"
}

# ---- Brevo ------------------------------------------------------------------
# Brevo generates these per account. Copy them from Brevo -> Senders, domains &
# dedicated IPs -> Domains -> sdatygerberg.co.za. Brevo's own guide says an
# account gets either two DKIM CNAME records or one DKIM TXT record, so the
# shape is a map and Terraform does not assume which.

variable "brevo_code" {
  description = "Value of the Brevo code TXT record that proves domain ownership."
  type        = string

  validation {
    condition     = length(trimspace(var.brevo_code)) > 0
    error_message = "brevo_code must not be empty. Copy it from the Brevo domain page."
  }
}

variable "brevo_dkim_records" {
  description = "DKIM records exactly as Brevo shows them, keyed by any stable label."
  type = map(object({
    type    = string
    name    = string
    content = string
  }))

  validation {
    condition     = length(var.brevo_dkim_records) > 0
    error_message = "Add at least one DKIM record from the Brevo domain page."
  }

  validation {
    condition     = alltrue([for r in values(var.brevo_dkim_records) : contains(["CNAME", "TXT"], r.type)])
    error_message = "Brevo DKIM records are CNAME or TXT; any other type is a copy-paste error."
  }
}

# Brevo rewrites every https link AND every <img src> in board mail to
# these hosts for click/open tracking (the signature's logo and site
# links). Without their CNAMEs every rewritten URL dies with NXDOMAIN.
# Copy all three from Brevo -> Senders, domains & dedicated IPs -> Domains
# -> sdatygerberg.co.za -> branding records. Empty (the default) creates
# nothing: use that only if tracking is switched off in Brevo instead.

variable "brevo_branding_cnames" {
  description = "CNAMEs Brevo click/open/image tracking rewrites mail URLs to. Empty where tracking is off in Brevo."
  type = map(object({
    name   = string
    target = string
  }))
  default = {}

  validation {
    condition     = alltrue([for r in values(var.brevo_branding_cnames) : length(trimspace(r.name)) > 0 && length(trimspace(r.target)) > 0])
    error_message = "Each brevo_branding_cnames entry needs both name and target, exactly as Brevo shows them."
  }
}

variable "brevo_api_key" {
  description = "Brevo API key (v3). Sent to the Worker as the BREVO_API_KEY secret."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.brevo_api_key) >= 20
    error_message = "brevo_api_key looks too short to be a real key."
  }
}

# ---- Google Cloud project and Sign-in ---------------------------------------
# Terraform creates the project. The OAuth consent screen and the Web client
# inside it are created by hand in Google Auth Platform: no Terraform resource
# can make an External consent screen or a Sign in with Google client (see
# README). Both client values stay null until that client exists, so the first
# apply can create the project, and a second apply adds the two secrets.

variable "google_project_id" {
  description = "Globally unique id for the new Google Cloud project; cannot be changed or reused once created."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.google_project_id))
    error_message = "6 to 30 characters: lowercase letters, digits and hyphens, starting with a letter and not ending in a hyphen."
  }
}

variable "google_project_name" {
  description = "Display name shown on the consent screen's console pages."
  type        = string
  default     = "SDA Tygerberg"

  validation {
    condition     = length(var.google_project_name) >= 4 && length(var.google_project_name) <= 30
    error_message = "Google requires a project name of 4 to 30 characters."
  }
}

variable "google_org_id" {
  description = "Numeric Google Cloud organisation id. Leave null for a project owned by a personal Google account."
  type        = string
  default     = null
}

variable "google_billing_account" {
  description = "Billing account to attach. Not needed for Sign in with Google; leave null."
  type        = string
  default     = null
}

variable "google_oauth_client_id" {
  description = "Client ID of the Web application OAuth client. Null until the client has been created."
  type        = string
  default     = null

  validation {
    condition     = var.google_oauth_client_id == null || can(regex("^[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com$", var.google_oauth_client_id))
    error_message = "Expected <digits>-<id>.apps.googleusercontent.com, as shown in Google Auth Platform."
  }

  validation {
    condition     = (var.google_oauth_client_id == null) == (var.google_oauth_client_secret == null)
    error_message = "Set google_oauth_client_id and google_oauth_client_secret together, or neither."
  }
}

variable "google_oauth_client_secret" {
  description = "Client secret of the same OAuth client. Null until the client has been created."
  type        = string
  default     = null
  sensitive   = true

  validation {
    condition     = var.google_oauth_client_secret == null || length(var.google_oauth_client_secret) >= 20
    error_message = "google_oauth_client_secret looks too short to be a real secret."
  }
}

variable "extra_redirect_origins" {
  description = "Extra origins to register on the OAuth client, for `wrangler dev`. Production is always included."
  type        = list(string)
  default     = ["http://localhost:8787"]

  validation {
    condition     = alltrue([for o in var.extra_redirect_origins : can(regex("^https?://[^/]+$", o))])
    error_message = "Origins are scheme://host[:port] with no path or trailing slash."
  }
}

# ---- Access control ---------------------------------------------------------

variable "session_secret_generation" {
  description = "Bump to rotate SESSION_SECRET. Rotating signs every board member out."
  type        = number
  default     = 1
}
