use crate::Caller;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub code: &'static str,
    pub field: Option<String>,
}

impl Problem {
    pub fn new(code: &'static str, field: Option<&str>) -> Self {
        Self {
            code,
            field: field.map(String::from),
        }
    }

    pub fn not_found(field: &str) -> Self {
        Self::new("not_found", Some(field))
    }
    pub fn unavailable() -> Self {
        Self::new("unavailable", None)
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
    pub fn allow_protection(&self, caller: &Caller, protected: bool) -> Result<(), Problem> {
        caller.allow_copy_mutation()?;
        if self.owner_id != caller.collection_owner() {
            return Err(Problem::not_found("copy_id"));
        }
        if protected && (self.allocated || self.held) {
            return Err(Problem::new("copy_not_free", Some("copy_id")));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Caller;

    #[test]
    fn protection_requires_the_verified_owner_and_a_free_copy_but_unprotect_does_not() {
        let owner = Caller::user("owner".into());
        let mut copy = ProtectableCopy {
            owner_id: "owner".into(),
            copy_id: "exact-copy".into(),
            allocated: false,
            held: false,
        };
        assert_eq!(copy.allow_protection(&owner, true), Ok(()));
        copy.held = true;
        assert_eq!(
            copy.allow_protection(&owner, true),
            Err(Problem::new("copy_not_free", Some("copy_id")))
        );
        assert_eq!(copy.allow_protection(&owner, false), Ok(()));
        copy.held = false;
        copy.allocated = true;
        assert_eq!(
            copy.allow_protection(&owner, true),
            Err(Problem::new("copy_not_free", Some("copy_id")))
        );
        assert_eq!(
            copy.allow_protection(&Caller::user("other".into()), false),
            Err(Problem::not_found("copy_id"))
        );
        assert_eq!(
            copy.allow_protection(&Caller::ai_client("owner".into(), "ai".into()), false),
            Err(Problem::new("mcp_token_forbidden", None))
        );
    }
}
