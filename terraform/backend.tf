# State holds the Brevo key, the Google client secret and the session secret in
# plain text, so it lives in a private Azure Storage container, authenticated
# with Entra ID rather than an account key. Everything account-specific is
# supplied at init time:
#
#   az login
#   terraform init -backend-config=backend.hcl
#
# See backend.hcl.example. The azurerm backend locks state with a blob lease,
# so concurrent applies fail instead of corrupting it.
terraform {
  backend "azurerm" {
    key              = "sda-tygerberg-website.tfstate"
    use_azuread_auth = true
  }
}
