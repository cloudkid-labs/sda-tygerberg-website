# ---- R2: website content for the members-area CMS (C-70) --------------------
# Events, department heads, pages (draft and live), processed images, the
# history of every write and the audit log. Production and devtest each get
# their own, so trialling the CMS never touches the live site.
#
# DEPLOYMENT ORDER: apply this BEFORE merging a wrangler.jsonc that binds the
# bucket. `wrangler deploy` refuses a binding to a bucket that does not exist,
# so the Worker deploy (consumer) fails until this (producer) has applied.
#
#   cloudflare_r2_bucket.cms          -> wrangler.jsonc r2_buckets CMS (top level)
#   cloudflare_r2_bucket.cms_devtest  -> wrangler.jsonc env.devtest r2_buckets CMS
#
# No lifecycle rule: content is current state, not a record with a retention
# period. `prevent_destroy` because a destroy would take every page and photo
# with it.

resource "cloudflare_r2_bucket" "cms" {
  account_id = var.cloudflare_account_id
  name       = "tygerberg-cms"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_bucket" "cms_devtest" {
  account_id = var.cloudflare_account_id
  name       = "tygerberg-cms-devtest"
}
