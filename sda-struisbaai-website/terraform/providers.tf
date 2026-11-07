# Credentials come from the environment, never from files in this directory:
#   CLOUDFLARE_API_TOKEN  Zone:Read + DNS:Edit on sdatygerberg.co.za, and
#                         Account: Workers R2 Storage:Edit (the CMS buckets, r2.tf)
#   GITHUB_TOKEN          fine-grained PAT, repo "Secrets" read/write on this repo only
#   (ADC)                 `gcloud auth application-default login`, as the Google
#                         account that will own the new project
# State access uses your `az login` identity; see backend.hcl.example.
provider "cloudflare" {}

provider "google" {}

provider "github" {
  owner = var.github_owner
}
