use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use mtgscan_application::VerifyIdentity;
use mtgscan_domain::{Caller, Refusal};
use serde::Deserialize;
use std::{
    future::Future,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub is_anonymous: bool,
}

pub trait AuthUserService: Send + Sync {
    fn verified_user(
        &self,
        credential: &str,
    ) -> impl Future<Output = Result<AuthUser, Refusal>> + Send;
}

pub trait Clock: Send + Sync {
    fn unix_seconds(&self) -> u64;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn unix_seconds(&self) -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
}

pub struct SupabaseIdentity<A, C> {
    auth: A,
    clock: C,
    issuer: String,
}

impl<A, C> SupabaseIdentity<A, C> {
    pub fn new(auth: A, clock: C, issuer: String) -> Self {
        Self {
            auth,
            clock,
            issuer,
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Audience {
    Single(String),
    Multiple(Vec<String>),
}

impl Audience {
    fn is_authenticated(&self) -> bool {
        match self {
            Self::Single(value) => value == "authenticated",
            Self::Multiple(values) => values.iter().any(|value| value == "authenticated"),
        }
    }
}

#[derive(Deserialize)]
struct Claims {
    iss: String,
    aud: Audience,
    sub: String,
    exp: u64,
    role: String,
    session_id: String,
    #[serde(default)]
    is_anonymous: bool,
    #[serde(flatten)]
    other: serde_json::Map<String, serde_json::Value>,
}

impl<A: AuthUserService, C: Clock> VerifyIdentity for SupabaseIdentity<A, C> {
    async fn verify(&self, credential: &str) -> Result<Caller, Refusal> {
        let user = self.auth.verified_user(credential).await?;
        let mut segments = credential.split('.');
        let payload = segments.nth(1).ok_or(Refusal::Unauthenticated)?;
        if segments.next().filter(|value| !value.is_empty()).is_none() || segments.next().is_some()
        {
            return Err(Refusal::Unauthenticated);
        }
        let bytes = URL_SAFE_NO_PAD
            .decode(payload)
            .map_err(|_| Refusal::Unauthenticated)?;
        let claims: Claims =
            serde_json::from_slice(&bytes).map_err(|_| Refusal::Unauthenticated)?;
        if claims.iss != self.issuer
            || !claims.aud.is_authenticated()
            || claims.exp <= self.clock.unix_seconds()
            || claims.role != "authenticated"
            || claims.sub != user.id
            || claims.is_anonymous
            || user.is_anonymous
            || !Uuid::parse_str(&claims.sub).is_ok_and(|id| !id.is_nil())
            || !Uuid::parse_str(&claims.session_id).is_ok_and(|id| !id.is_nil())
        {
            return Err(Refusal::Unauthenticated);
        }
        if let Some(client_id) = claims.other.get("client_id") {
            return Ok(Caller::ai_client(
                user.id,
                client_id.as_str().unwrap_or_default().into(),
            ));
        }
        Ok(Caller::user(user.id))
    }
}

pub struct HttpSupabaseAuth {
    client: reqwest::Client,
    user_url: reqwest::Url,
    publishable_key: String,
}

impl HttpSupabaseAuth {
    pub fn new(base_url: &str, publishable_key: String) -> Result<Self, &'static str> {
        let base = reqwest::Url::parse(base_url).map_err(|_| "Invalid Supabase URL")?;
        if base.scheme() != "https"
            || base.host_str().is_none()
            || !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
            || base.path() != "/"
            || !publishable_key.starts_with("sb_publishable_")
        {
            return Err("Use an HTTPS Supabase origin and a publishable key");
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|_| "Could not build Auth client")?;
        Ok(Self {
            client,
            user_url: base.join("auth/v1/user").map_err(|_| "Invalid Auth URL")?,
            publishable_key,
        })
    }
}

impl AuthUserService for HttpSupabaseAuth {
    async fn verified_user(&self, credential: &str) -> Result<AuthUser, Refusal> {
        let response = self
            .client
            .get(self.user_url.clone())
            .header("apikey", &self.publishable_key)
            .bearer_auth(credential)
            .send()
            .await
            .map_err(|_| Refusal::Unavailable)?;
        match response.status().as_u16() {
            200 => response.json().await.map_err(|_| Refusal::Unavailable),
            400 | 401 | 403 | 422 => Err(Refusal::Unauthenticated),
            _ => Err(Refusal::Unavailable),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use mtgscan_application::current_account;
    use serde_json::json;

    struct Auth;
    impl AuthUserService for Auth {
        async fn verified_user(&self, _: &str) -> Result<AuthUser, Refusal> {
            Ok(AuthUser {
                id: "00000000-0000-4000-8000-000000000001".into(),
                is_anonymous: false,
            })
        }
    }
    struct Time;
    impl Clock for Time {
        fn unix_seconds(&self) -> u64 {
            1000
        }
    }

    fn credential(claims: serde_json::Value) -> String {
        format!(
            "e30.{}.external-verifier-signature",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap())
        )
    }

    fn claims() -> serde_json::Value {
        json!({
            "iss": "https://project.supabase.co/auth/v1", "aud": "authenticated",
            "sub": "00000000-0000-4000-8000-000000000001", "exp": 1100,
            "role": "authenticated", "session_id": "00000000-0000-4000-8000-000000000002"
        })
    }

    struct RefusedAuth;
    impl AuthUserService for RefusedAuth {
        async fn verified_user(&self, _: &str) -> Result<AuthUser, Refusal> {
            Err(Refusal::Unauthenticated)
        }
    }

    #[tokio::test]
    async fn decoded_claims_never_substitute_for_trusted_verification() {
        let identity = SupabaseIdentity::new(
            RefusedAuth,
            Time,
            "https://project.supabase.co/auth/v1".into(),
        );
        assert_eq!(
            current_account(&identity, Some(&credential(claims()))).await,
            Err(Refusal::Unauthenticated)
        );
    }

    #[tokio::test]
    async fn expired_wrong_audience_wrong_issuer_and_wrong_actor_sessions_are_refused() {
        let identity =
            SupabaseIdentity::new(Auth, Time, "https://project.supabase.co/auth/v1".into());
        for (field, value) in [
            ("exp", json!(1000)),
            ("aud", json!("other")),
            ("iss", json!("https://attacker.test/auth/v1")),
            ("sub", json!("00000000-0000-4000-8000-000000000099")),
            ("role", json!("service_role")),
            ("is_anonymous", json!(true)),
            ("session_id", json!("")),
        ] {
            let mut value_claims = claims();
            value_claims[field] = value;
            assert_eq!(
                current_account(&identity, Some(&credential(value_claims))).await,
                Err(Refusal::Unauthenticated),
                "{field}"
            );
        }
    }

    #[tokio::test]
    async fn verified_ai_claims_cannot_be_hidden_in_native_requests() {
        let identity =
            SupabaseIdentity::new(Auth, Time, "https://project.supabase.co/auth/v1".into());
        for marker in [json!("client"), json!(null), json!("")] {
            let mut value = claims();
            value["client_id"] = marker;
            value["aud"] = json!(["authenticated", "https://mcp.test"]);
            assert_eq!(
                current_account(&identity, Some(&credential(value))).await,
                Err(Refusal::McpTokenForbidden)
            );
        }
    }

    #[tokio::test]
    async fn a_verified_native_session_returns_only_its_account_id() {
        let identity =
            SupabaseIdentity::new(Auth, Time, "https://project.supabase.co/auth/v1".into());
        let token = credential(json!({
            "iss": "https://project.supabase.co/auth/v1", "aud": "authenticated",
            "sub": "00000000-0000-4000-8000-000000000001", "exp": 1100,
            "role": "authenticated", "session_id": "00000000-0000-4000-8000-000000000002",
            "user_metadata": {"owner": "another-user", "role": "service_role", "client_id": "pretend"}
        }));
        assert_eq!(
            current_account(&identity, Some(&token)).await,
            Ok("00000000-0000-4000-8000-000000000001".into())
        );
    }
}
