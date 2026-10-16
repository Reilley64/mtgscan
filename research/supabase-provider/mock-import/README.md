# Mock import check

A throwaway check of how provider v1.11.0 imports and plans `supabase_settings`. `mock.py` is a local stand-in for a few Management API endpoints with made-up values. It is not the hosted project.

```bash
python3 mock.py 18999 requests.log &
export SUPABASE_API_ENDPOINT=http://127.0.0.1:18999 SUPABASE_ACCESS_TOKEN=sbp_fake
export TF_VAR_apple_secret=apple-secret-v1 TF_VAR_google_secret=google-secret-v1
tofu init && tofu plan
```

`requests.log` records each request. Secret values in PATCH bodies are written as `<redacted>`. `main.tf` keeps the non-secret auth keys in `supabase_settings.mtgscan` and the two secrets in `supabase_settings.mtgscan_auth_secrets`.
