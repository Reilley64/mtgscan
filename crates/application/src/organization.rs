use crate::VerifyIdentity;
use mtgscan_domain::organization::user_tag_name;
pub use mtgscan_domain::organization::{Problem, ProtectableCopy, UserTag};
use mtgscan_domain::{Caller, Refusal};
use std::future::Future;

pub trait OrganizationStore: Send + Sync {
    type Transaction: OrganizationTransaction;
    fn begin(
        &self,
        caller: &Caller,
    ) -> impl Future<Output = Result<Self::Transaction, Problem>> + Send;
}

pub trait OrganizationTransaction: Send {
    fn lock_copy(
        &mut self,
        id: &str,
    ) -> impl Future<Output = Result<Option<ProtectableCopy>, Problem>> + Send;
    fn protect(
        &mut self,
        id: &str,
        protected: bool,
    ) -> impl Future<Output = Result<(), Problem>> + Send;
    fn find_user_tag_by_name(
        &mut self,
        name: &str,
    ) -> impl Future<Output = Result<Option<UserTag>, Problem>> + Send;
    fn create_user_tag(
        &mut self,
        name: &str,
    ) -> impl Future<Output = Result<(UserTag, bool), Problem>> + Send;
    fn user_tags(
        &mut self,
        deleted: bool,
    ) -> impl Future<Output = Result<Vec<UserTag>, Problem>> + Send;
    fn user_tag(
        &mut self,
        id: &str,
    ) -> impl Future<Output = Result<Option<UserTag>, Problem>> + Send;
    fn rename_user_tag(
        &mut self,
        id: &str,
        name: &str,
    ) -> impl Future<Output = Result<(), Problem>> + Send;
    fn delete_user_tag(
        &mut self,
        id: &str,
        deleted: bool,
    ) -> impl Future<Output = Result<(), Problem>> + Send;
    fn set_user_tag(
        &mut self,
        id: &str,
        copies: &[String],
        tagged: bool,
    ) -> impl Future<Output = Result<(), Problem>> + Send;
    fn commit(self) -> impl Future<Output = Result<(), Problem>> + Send;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Protect {
        copy_id: String,
        protected: bool,
    },
    CreateUserTag {
        name: String,
    },
    ListUserTags {
        deleted: bool,
    },
    RenameUserTag {
        user_tag_id: String,
        name: String,
    },
    DeleteUserTag {
        user_tag_id: String,
    },
    RestoreUserTag {
        user_tag_id: String,
    },
    SetUserTag {
        user_tag_id: String,
        copy_ids: Vec<String>,
        tagged: bool,
        single: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Protected {
        copy_id: String,
        protected: bool,
    },
    Created {
        user_tag: UserTag,
        created: bool,
    },
    UserTags(Vec<UserTag>),
    Renamed(UserTag),
    Deleted {
        user_tag_id: String,
        changed: bool,
        copy_count: i64,
    },
    Restored {
        user_tag: UserTag,
        changed: bool,
    },
    UserTagLinksChanged {
        changed: Vec<String>,
        skipped: Vec<String>,
    },
}

pub struct OrganizationReply {
    pub outcome: Outcome,
    pub ai_client: bool,
}

pub async fn organize(
    identity: &impl VerifyIdentity,
    store: &impl OrganizationStore,
    credential: Option<&str>,
    command: Command,
) -> Result<OrganizationReply, Problem> {
    let credential = credential
        .filter(|s| !s.is_empty())
        .ok_or(Problem::new("unauthenticated", None))?;
    let caller = identity.verify(credential).await.map_err(|error| {
        Problem::new(
            match error {
                Refusal::Unauthenticated => "unauthenticated",
                Refusal::McpTokenForbidden => "mcp_token_forbidden",
                Refusal::Unavailable => "unavailable",
            },
            None,
        )
    })?;
    if matches!(command, Command::Protect { .. }) {
        caller.allow_copy_mutation()?;
    }
    let mut tx = store.begin(&caller).await?;
    let outcome = match command {
        Command::ListUserTags { deleted } => Outcome::UserTags(tx.user_tags(deleted).await?),
        Command::RenameUserTag { user_tag_id, name } => {
            let name = user_tag_name(&name)?;
            let mut user_tag = active_user_tag(&mut tx, &user_tag_id).await?;
            if tx
                .find_user_tag_by_name(&name)
                .await?
                .is_some_and(|other| other.user_tag_id != user_tag_id)
            {
                return Err(Problem::new("user_tag_exists", Some("name")));
            }
            tx.rename_user_tag(&user_tag_id, &name).await?;
            user_tag.name = name;
            Outcome::Renamed(user_tag)
        }
        Command::DeleteUserTag { user_tag_id } => {
            let user_tag = tx
                .user_tag(&user_tag_id)
                .await?
                .ok_or(Problem::not_found("user_tag_id"))?;
            if user_tag.deleted && !caller.is_ai_client() {
                return Err(Problem::not_found("user_tag_id"));
            }
            if !user_tag.deleted {
                tx.delete_user_tag(&user_tag_id, true).await?;
            }
            Outcome::Deleted {
                user_tag_id,
                changed: !user_tag.deleted,
                copy_count: if user_tag.deleted {
                    0
                } else {
                    user_tag.copy_count
                },
            }
        }
        Command::RestoreUserTag { user_tag_id } => {
            let mut user_tag = tx
                .user_tag(&user_tag_id)
                .await?
                .ok_or(Problem::not_found("user_tag_id"))?;
            let changed = user_tag.deleted;
            if changed {
                if tx.find_user_tag_by_name(&user_tag.name).await?.is_some() {
                    return Err(Problem::new("user_tag_exists", Some("user_tag_id")));
                }
                tx.delete_user_tag(&user_tag_id, false).await?;
                user_tag.deleted = false;
            }
            Outcome::Restored { user_tag, changed }
        }
        Command::SetUserTag {
            user_tag_id,
            copy_ids,
            tagged,
            single,
        } => {
            if !(1..=100).contains(&copy_ids.len()) || (single && copy_ids.len() != 1) {
                return Err(Problem::new("invalid_argument", Some("copy_ids")));
            }
            for (index, id) in copy_ids.iter().enumerate() {
                if copy_ids[..index]
                    .iter()
                    .any(|other| other.eq_ignore_ascii_case(id))
                {
                    return Err(Problem::new(
                        "invalid_argument",
                        Some(&format!("copy_ids[{index}]")),
                    ));
                }
            }
            active_user_tag(&mut tx, &user_tag_id).await?;
            let mut found = Vec::new();
            let mut ordered = copy_ids.clone();
            ordered.sort();
            for id in ordered {
                if tx
                    .lock_copy(&id)
                    .await?
                    .is_some_and(|copy| copy.owner_id == caller.collection_owner())
                {
                    found.push(id);
                }
            }
            let (changed, skipped): (Vec<_>, Vec<_>) =
                copy_ids.into_iter().partition(|id| found.contains(id));
            if single && !skipped.is_empty() {
                return Err(Problem::not_found("copy_id"));
            }
            tx.set_user_tag(&user_tag_id, &changed, tagged).await?;
            Outcome::UserTagLinksChanged { changed, skipped }
        }
        Command::CreateUserTag { name } => {
            let name = user_tag_name(&name)?;
            let (user_tag, created) = tx.create_user_tag(&name).await?;
            if !created && !caller.is_ai_client() {
                return Err(Problem::new("user_tag_exists", Some("name")));
            }
            Outcome::Created { user_tag, created }
        }
        Command::Protect { copy_id, protected } => {
            let copy = tx
                .lock_copy(&copy_id)
                .await?
                .ok_or(Problem::not_found("copy_id"))?;
            copy.allow_protection(&caller, protected)?;
            tx.protect(&copy_id, protected).await?;
            Outcome::Protected { copy_id, protected }
        }
    };
    tx.commit().await?;
    Ok(OrganizationReply {
        outcome,
        ai_client: caller.is_ai_client(),
    })
}

async fn active_user_tag(
    tx: &mut impl OrganizationTransaction,
    id: &str,
) -> Result<UserTag, Problem> {
    tx.user_tag(id)
        .await?
        .filter(|user_tag| !user_tag.deleted)
        .ok_or(Problem::not_found("user_tag_id"))
}

#[cfg(test)]
mod tests;
