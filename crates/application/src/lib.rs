use mtgscan_domain::{Caller, Refusal};
use std::future::Future;

pub trait VerifyIdentity: Send + Sync {
    fn verify(&self, credential: &str) -> impl Future<Output = Result<Caller, Refusal>> + Send;
}

pub async fn current_account(
    identity: &impl VerifyIdentity,
    credential: Option<&str>,
) -> Result<String, Refusal> {
    let credential = credential
        .filter(|value| !value.is_empty())
        .ok_or(Refusal::Unauthenticated)?;
    identity.verify(credential).await?.native_account()
}

#[cfg(test)]
mod tests {
    use super::*;
    use mtgscan_domain::{Caller, Refusal};

    struct Identity;

    impl VerifyIdentity for Identity {
        async fn verify(&self, _: &str) -> Result<Caller, Refusal> {
            Ok(Caller::user("user-1".into()))
        }
    }

    struct RefusedIdentity(Refusal);

    impl VerifyIdentity for RefusedIdentity {
        async fn verify(&self, _: &str) -> Result<Caller, Refusal> {
            Err(self.0)
        }
    }

    struct AiIdentity;

    impl VerifyIdentity for AiIdentity {
        async fn verify(&self, _: &str) -> Result<Caller, Refusal> {
            Ok(Caller::ai_client("user-1".into(), "client-1".into()))
        }
    }

    #[tokio::test]
    async fn anonymous_and_invalid_callers_cannot_read_an_account() {
        assert_eq!(
            current_account(&Identity, None).await,
            Err(Refusal::Unauthenticated)
        );
        assert_eq!(
            current_account(&Identity, Some("")).await,
            Err(Refusal::Unauthenticated)
        );
        assert_eq!(
            current_account(&RefusedIdentity(Refusal::Unauthenticated), Some("invalid")).await,
            Err(Refusal::Unauthenticated)
        );
    }

    #[tokio::test]
    async fn an_ai_client_cannot_enter_the_native_account_shell() {
        assert_eq!(
            current_account(&AiIdentity, Some("ai-credential")).await,
            Err(Refusal::McpTokenForbidden)
        );
    }

    #[tokio::test]
    async fn identity_outages_are_not_reported_as_signed_out() {
        assert_eq!(
            current_account(&RefusedIdentity(Refusal::Unavailable), Some("credential")).await,
            Err(Refusal::Unavailable)
        );
    }

    #[tokio::test]
    async fn current_account_comes_from_the_verified_caller() {
        assert_eq!(
            current_account(&Identity, Some("credential")).await,
            Ok("user-1".to_string())
        );
    }
}
