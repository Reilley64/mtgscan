terraform {
  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "1.11.0"
    }
  }
}

provider "supabase" {}

locals {
  ref = "abcdefghijklmnopqrst"
}

import {
  to = supabase_project.mtgscan
  id = local.ref
}

resource "supabase_project" "mtgscan" {
  organization_id   = "mtgscan-org"
  name              = "mtgscan"
  region            = "ap-southeast-2"
  database_password = "not-managed-by-opentofu"

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [database_password]
  }
}

import {
  to = supabase_settings.mtgscan
  id = local.ref
}

resource "supabase_settings" "mtgscan" {
  project_ref = local.ref

  auth = jsonencode({
    site_url                                = "https://mtgscan.reilley.dev"
    uri_allow_list                          = "https://mtgscan.reilley.dev/oauth/consent"
    external_apple_enabled                  = true
    external_apple_client_id                = "dev.reilley.mtgscan.web,dev.reilley.mtgscan"
    external_google_enabled                 = true
    external_google_client_id               = "web-id.apps.googleusercontent.com,ios-id.apps.googleusercontent.com"
    external_google_skip_nonce_check        = true
    hook_before_user_created_enabled        = true
    hook_before_user_created_uri            = "pg-functions://postgres/public/limit_email_sign_ups"
    oauth_server_enabled                    = true
    oauth_server_allow_dynamic_registration = true
    oauth_server_authorization_path         = "/oauth/consent"
    jwt_exp                                 = 3600
    rate_limit_token_refresh                = 150
    rate_limit_otp                          = 30
    rate_limit_verify                       = 30
  })
}

variable "apple_secret" {
  type      = string
  sensitive = true
}

variable "google_secret" {
  type      = string
  sensitive = true
}

import {
  to = supabase_settings.mtgscan_auth_secrets
  id = local.ref
}

resource "supabase_settings" "mtgscan_auth_secrets" {
  project_ref = local.ref

  auth = jsonencode({
    external_apple_secret  = var.apple_secret
    external_google_secret = var.google_secret
  })
}
