# A project of its own keeps the consent screen, the OAuth client and any future
# Google credentials for this site apart from other apps (the webinar app).
#
# Nothing else is declared here on purpose. Sign in with Google needs no API
# enabled, and `google_iap_brand` can only create an *Internal* consent screen
# (organisation members only), which would lock out board members on Gmail accounts.
resource "google_project" "this" {
  name       = var.google_project_name
  project_id = var.google_project_id

  org_id          = var.google_org_id
  billing_account = var.google_billing_account

  # No Compute API, no default network to clean up.
  auto_create_network = false

  # `terraform destroy` stops at this resource by design. Project ids cannot be
  # reused, so deleting by accident is worse than a destroy that needs one extra edit.
  deletion_policy = "PREVENT"

  labels = {
    app        = "sda-tygerberg-website"
    managed-by = "terraform"
  }
}
