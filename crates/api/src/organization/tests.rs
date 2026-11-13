use super::*;
use mtgscan_application::organization::{OrganizationTransaction, ProtectableCopy, UserTag};
use mtgscan_domain::{Caller, Refusal};

struct Auth;
impl VerifyIdentity for Auth {
    async fn verify(&self, token: &str) -> Result<Caller, Refusal> {
        match token {
            "ai" => Ok(Caller::ai_client("owner".into(), "verified-client".into())),
            "invalid" => Err(Refusal::Unauthenticated),
            _ => Ok(Caller::user("owner".into())),
        }
    }
}
struct Database;
struct Transaction;
impl OrganizationStore for Database {
    type Transaction = Transaction;
    async fn begin(&self, _: &Caller) -> Result<Transaction, Problem> {
        Ok(Transaction)
    }
}
impl OrganizationTransaction for Transaction {
    async fn lock_copy(&mut self, _: &str) -> Result<Option<ProtectableCopy>, Problem> {
        Ok(None)
    }
    async fn protect(&mut self, _: &str, _: bool) -> Result<(), Problem> {
        Err(Problem::unavailable())
    }
    async fn find_name(&mut self, _: &str) -> Result<Option<UserTag>, Problem> {
        Ok(None)
    }
    async fn create_tag(&mut self, name: &str) -> Result<(UserTag, bool), Problem> {
        Ok((
            UserTag {
                user_tag_id: "10000000-0000-4000-8000-000000000001".into(),
                name: name.into(),
                deleted: false,
                copy_count: 0,
            },
            true,
        ))
    }
    async fn tags(&mut self, _: bool) -> Result<Vec<UserTag>, Problem> {
        Ok(vec![])
    }
    async fn tag(&mut self, _: &str) -> Result<Option<UserTag>, Problem> {
        Ok(None)
    }
    async fn rename_tag(&mut self, _: &str, _: &str) -> Result<(), Problem> {
        Err(Problem::unavailable())
    }
    async fn delete_tag(&mut self, _: &str, _: bool) -> Result<(), Problem> {
        Err(Problem::unavailable())
    }
    async fn set_tag(&mut self, _: &str, _: &[String], _: bool) -> Result<(), Problem> {
        Err(Problem::unavailable())
    }
    async fn commit(self) -> Result<(), Problem> {
        Ok(())
    }
}
async fn request(auth: Option<&str>, value: serde_json::Value) -> CollectionResponse {
    organization_response(
        &Auth,
        &Database,
        auth,
        "",
        &serde_json::to_vec(&value).unwrap(),
    )
    .await
}

#[tokio::test]
async fn api_actor_specific_replies_come_from_verified_credentials_not_request_claims() {
    let action = json!({"action":"create_user_tag","name":" Signed "});
    let user = request(Some("Bearer user"), action.clone()).await;
    assert_eq!(user.status, 200);
    assert_eq!(
        user.body,
        json!({"user_tag_id":"10000000-0000-4000-8000-000000000001","name":"Signed"})
    );
    let ai = request(Some("Bearer ai"), action).await;
    assert_eq!(
        ai.body,
        json!({"user_tag_id":"10000000-0000-4000-8000-000000000001","name":"Signed","created":true})
    );
    let forged = request(
        Some("Bearer user"),
        json!({"action":"create_user_tag","name":"Signed","created_by":"forged"}),
    )
    .await;
    assert_eq!(
        forged.body,
        json!({"error":{"code":"invalid_argument","field":"created_by"}})
    );
}

#[tokio::test]
async fn api_refuses_ai_protection_and_preserves_missing_copy_and_auth_errors() {
    let action = json!({"action":"set_copy_protected","copy_id":"10000000-0000-4000-8000-000000000001","protected":true});
    let ai = request(Some("Bearer ai"), action.clone()).await;
    assert_eq!(ai.status, 403);
    assert_eq!(
        ai.body,
        json!({"error":{"code":"mcp_token_forbidden","field":null}})
    );
    let user = request(Some("Bearer user"), action.clone()).await;
    assert_eq!(
        user.body,
        json!({"error":{"code":"not_found","field":"copy_id"}})
    );
    for auth in [
        None,
        Some("Basic token"),
        Some("Bearer invalid"),
        Some("Bearer token extra"),
    ] {
        assert_eq!(request(auth, action.clone()).await.status, 401);
    }
}
