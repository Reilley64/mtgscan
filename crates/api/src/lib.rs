pub mod catalog;
pub mod collection;
pub mod collection_contract;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use mtgscan_application::{VerifyIdentity, current_account};
use mtgscan_domain::Refusal;
use serde_json::{Value, json};
use std::sync::Arc;

pub const CURRENT_ACCOUNT_PATH: &str = "/api/v1/account";

pub struct AccountResponse {
    pub status: u16,
    pub body: Value,
}

pub async fn current_account_response(
    identity: &impl VerifyIdentity,
    authorization: Option<&str>,
) -> AccountResponse {
    let credential = authorization.and_then(|value| {
        let (scheme, credential) = value.split_once(' ')?;
        (scheme.eq_ignore_ascii_case("bearer")
            && !credential.is_empty()
            && !credential.chars().any(char::is_whitespace))
        .then_some(credential)
    });
    match current_account(identity, credential).await {
        Ok(account_id) => AccountResponse {
            status: 200,
            body: json!({"account_id": account_id}),
        },
        Err(refusal) => {
            let (status, code) = match refusal {
                Refusal::Unauthenticated => (401, "unauthenticated"),
                Refusal::McpTokenForbidden => (403, "mcp_token_forbidden"),
                Refusal::Unavailable => (503, "identity_unavailable"),
            };
            AccountResponse {
                status,
                body: json!({"error": {"code": code}}),
            }
        }
    }
}

pub fn router<I: VerifyIdentity + 'static>(identity: I) -> Router {
    Router::new()
        .route(CURRENT_ACCOUNT_PATH, get(account::<I>))
        .with_state(Arc::new(identity))
}

async fn account<I: VerifyIdentity>(
    State(identity): State<Arc<I>>,
    headers: HeaderMap,
) -> Response {
    let authorization = if headers.get_all(header::AUTHORIZATION).iter().count() == 1 {
        headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
    } else {
        None
    };
    let reply = current_account_response(identity.as_ref(), authorization).await;
    let mut response = (
        StatusCode::from_u16(reply.status).unwrap(),
        Json(reply.body),
    )
        .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    if reply.status == 401 {
        response
            .headers_mut()
            .insert(header::WWW_AUTHENTICATE, "Bearer".parse().unwrap());
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use mtgscan_domain::{Caller, Refusal};

    struct Auth;
    impl VerifyIdentity for Auth {
        async fn verify(&self, _: &str) -> Result<Caller, Refusal> {
            Ok(Caller::user("account-1".into()))
        }
    }

    struct Refused(Refusal);
    impl VerifyIdentity for Refused {
        async fn verify(&self, _: &str) -> Result<Caller, Refusal> {
            Err(self.0)
        }
    }

    #[tokio::test]
    async fn malformed_authorization_is_refused_even_when_an_owner_is_supplied_elsewhere() {
        for value in [
            None,
            Some("Basic token"),
            Some("Bearer "),
            Some("Bearer two tokens"),
        ] {
            let reply = current_account_response(&Auth, value).await;
            assert_eq!(reply.status, 401);
            assert_eq!(
                reply.body,
                serde_json::json!({"error":{"code":"unauthenticated"}})
            );
        }
    }

    #[tokio::test]
    async fn refusals_keep_their_http_meaning_without_exposing_credentials() {
        for (refusal, status, code) in [
            (Refusal::Unauthenticated, 401, "unauthenticated"),
            (Refusal::McpTokenForbidden, 403, "mcp_token_forbidden"),
            (Refusal::Unavailable, 503, "identity_unavailable"),
        ] {
            let reply = current_account_response(&Refused(refusal), Some("Bearer secret")).await;
            assert_eq!(reply.status, status);
            assert_eq!(reply.body, serde_json::json!({"error":{"code":code}}));
        }
    }

    #[tokio::test]
    async fn the_versioned_route_ignores_request_owner_and_never_caches_accounts() {
        use axum::{
            body::{Body, to_bytes},
            http::Request,
        };
        use tower::ServiceExt;
        let reply = router(Auth)
            .oneshot(
                Request::builder()
                    .uri("/api/v1/account?owner=attacker")
                    .header("Authorization", "Bearer token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(reply.status(), 200);
        assert_eq!(reply.headers()["cache-control"], "no-store");
        let body = to_bytes(reply.into_body(), 1024).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({"account_id":"account-1"})
        );
    }

    #[tokio::test]
    async fn current_account_is_versioned_json_with_no_caller_supplied_owner() {
        let reply = current_account_response(&Auth, Some("Bearer credential")).await;
        assert_eq!(reply.status, 200);
        assert_eq!(reply.body, serde_json::json!({"account_id":"account-1"}));
    }
}
