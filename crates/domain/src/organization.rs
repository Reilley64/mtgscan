use crate::Refusal;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub code: &'static str,
    pub field: Option<&'static str>,
}

impl Problem {
    pub fn new(code: &'static str, field: Option<&'static str>) -> Self {
        Self { code, field }
    }

    pub fn not_found(field: &'static str) -> Self {
        Self::new("not_found", Some(field))
    }
    pub fn unavailable() -> Self {
        Self::new("unavailable", None)
    }
}

impl From<Refusal> for Problem {
    fn from(refusal: Refusal) -> Self {
        match refusal {
            Refusal::Unauthenticated => Self::new("unauthenticated", None),
            Refusal::McpTokenForbidden => Self::new("mcp_token_forbidden", None),
            Refusal::Unavailable => Self::unavailable(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserTag {
    pub user_tag_id: String,
    pub name: String,
    pub deleted: bool,
    pub copy_count: i64,
}

pub fn user_tag_name(name: &str) -> Result<String, Problem> {
    let name = name.trim();
    if !(1..=64).contains(&name.chars().count()) {
        return Err(Problem::new("invalid_argument", Some("name")));
    }
    Ok(name.into())
}

#[derive(Debug, Clone)]
pub struct ProtectableCopy {
    pub owner_id: String,
    pub copy_id: String,
    pub allocated: bool,
    pub held: bool,
}

impl ProtectableCopy {
    pub fn allow_protection(&self, protected: bool) -> Result<(), Problem> {
        if protected && (self.allocated || self.held) {
            return Err(Problem::new("copy_not_free", Some("copy_id")));
        }
        Ok(())
    }
}
