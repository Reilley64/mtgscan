pub mod collection;
pub mod organization;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    Unauthenticated,
    McpTokenForbidden,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Caller {
    user_id: String,
    client_id: Option<String>,
}

impl Caller {
    pub fn user(user_id: String) -> Self {
        Self {
            user_id,
            client_id: None,
        }
    }

    pub fn ai_client(user_id: String, client_id: String) -> Self {
        Self {
            user_id,
            client_id: Some(client_id),
        }
    }

    pub fn collection_owner(&self) -> &str {
        &self.user_id
    }

    pub fn is_ai_client(&self) -> bool {
        self.client_id.is_some()
    }

    pub fn actor_id(&self) -> &str {
        self.client_id.as_deref().unwrap_or(&self.user_id)
    }

    pub fn allow_copy_mutation(&self) -> Result<(), organization::Problem> {
        if self.is_ai_client() {
            return Err(organization::Problem::new("mcp_token_forbidden", None));
        }
        Ok(())
    }

    pub fn native_account(self) -> Result<String, Refusal> {
        if self.client_id.is_some() {
            return Err(Refusal::McpTokenForbidden);
        }
        Ok(self.user_id)
    }
}
