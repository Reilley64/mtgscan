import json, hashlib, sys
from http.server import BaseHTTPRequestHandler, HTTPServer
REF = "abcdefghijklmnopqrst"
LOG = open(sys.argv[2], "a")
def h(s): return hashlib.sha256(s.encode()).hexdigest()
SECRETS = {"external_apple_secret", "external_google_secret"}
auth = {
  "site_url": "https://mtgscan.reilley.dev",
  "uri_allow_list": "https://mtgscan.reilley.dev/oauth/consent",
  "external_apple_enabled": True,
  "external_apple_client_id": "dev.reilley.mtgscan.web,dev.reilley.mtgscan",
  "external_apple_additional_client_ids": None,
  "external_apple_secret": h("apple-secret-v1"),
  "external_apple_email_optional": False,
  "external_google_enabled": True,
  "external_google_client_id": "web-id.apps.googleusercontent.com,ios-id.apps.googleusercontent.com",
  "external_google_additional_client_ids": None,
  "external_google_secret": h("google-secret-v1"),
  "external_google_skip_nonce_check": True,
  "external_google_email_optional": False,
  "hook_before_user_created_enabled": True,
  "hook_before_user_created_uri": "pg-functions://postgres/public/limit_email_sign_ups",
  "hook_before_user_created_secrets": None,
  "oauth_server_enabled": True,
  "oauth_server_allow_dynamic_registration": True,
  "oauth_server_authorization_path": "/oauth/consent",
  "jwt_exp": 3600,
  "rate_limit_email_sent": 2,
  "rate_limit_sms_sent": 30,
  "rate_limit_anonymous_users": 30,
  "rate_limit_token_refresh": 150,
  "rate_limit_otp": 30,
  "rate_limit_verify": 30,
  "rate_limit_web3": 30,
  "disable_signup": False,
  "mailer_otp_exp": 3600,
  "mfa_phone_otp_length": 6,
  "sms_otp_length": 6,
  "smtp_admin_email": None,
}
postgrest = {"db_schema": "public,graphql_public", "db_extra_search_path": "public,extensions", "max_rows": 1000, "db_pool": None, "jwt_secret": "x"}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type","application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")
    def do_GET(self):
        p = self.path.split("?")[0]
        LOG.write(f"GET {p}\n"); LOG.flush()
        base = f"/v1/projects/{REF}"
        if p == base: return self.send(200, {"id": REF, "ref": REF, "organization_id": "mtgscan-org", "organization_slug": "mtgscan-org", "name": "mtgscan", "region": "ap-southeast-2", "status": "ACTIVE_HEALTHY", "created_at": "2026-01-01T00:00:00Z", "database": {"host": "db", "version": "17", "postgres_engine": "17", "release_channel": "ga"}})
        if p == base + "/health": return self.send(200, [{"name": n, "healthy": True, "status": "ACTIVE_HEALTHY"} for n in ["auth","db","pooler","realtime","rest","storage"]])
        if p == base + "/config/auth": return self.send(200, auth)
        if p == base + "/postgrest": return self.send(200, postgrest)
        if p == base + "/api-keys/legacy": return self.send(200, {"enabled": False})
        if p == base + "/billing/addons": return self.send(200, {"selected_addons": [], "available_addons": []})
        return self.send(404, {"message": "not mocked"})
    def do_PATCH(self):
        p = self.path.split("?")[0]; b = self.body()
        red = {k: ("<redacted>" if k in SECRETS else v) for k, v in b.items()}
        LOG.write(f"PATCH {p} {json.dumps(red, sort_keys=True)}\n"); LOG.flush()
        if p.endswith("/config/auth"):
            for k, v in b.items():
                auth[k] = h(v) if k in SECRETS and v else v
            return self.send(200, auth)
        return self.send(404, {"message": "not mocked"})
    do_PUT = do_PATCH
    do_POST = do_PATCH
HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
