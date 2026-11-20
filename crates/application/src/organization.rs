use mtgscan_domain::Caller;
use mtgscan_domain::organization::user_tag_name;
pub use mtgscan_domain::organization::{Problem, ProtectableCopy, UserTag};
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
    fn set_copy_user_tag(
        &mut self,
        id: &str,
        copy_id: &str,
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
    SetCopyUserTag {
        copy_id: String,
        user_tag_id: String,
        tagged: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Protected { copy_id: String, protected: bool },
    Created(UserTag),
    UserTags(Vec<UserTag>),
    Renamed(UserTag),
    Deleted,
    Restored { user_tag: UserTag, changed: bool },
    UserTagLinkChanged,
}

pub async fn organize(
    store: &impl OrganizationStore,
    caller: &Caller,
    command: Command,
) -> Result<Outcome, Problem> {
    caller.require_user_actor()?;
    let mut tx = store.begin(caller).await?;
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
            active_user_tag(&mut tx, &user_tag_id).await?;
            tx.delete_user_tag(&user_tag_id, true).await?;
            Outcome::Deleted
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
        Command::SetCopyUserTag {
            copy_id,
            user_tag_id,
            tagged,
        } => {
            active_user_tag(&mut tx, &user_tag_id).await?;
            lock_owned_copy(&mut tx, caller, &copy_id).await?;
            tx.set_copy_user_tag(&user_tag_id, &copy_id, tagged).await?;
            Outcome::UserTagLinkChanged
        }
        Command::CreateUserTag { name } => {
            let name = user_tag_name(&name)?;
            let (user_tag, created) = tx.create_user_tag(&name).await?;
            if !created {
                return Err(Problem::new("user_tag_exists", Some("name")));
            }
            Outcome::Created(user_tag)
        }
        Command::Protect { copy_id, protected } => {
            let copy = lock_owned_copy(&mut tx, caller, &copy_id).await?;
            copy.allow_protection(protected)?;
            tx.protect(&copy_id, protected).await?;
            Outcome::Protected { copy_id, protected }
        }
    };
    tx.commit().await?;
    Ok(outcome)
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

async fn lock_owned_copy(
    tx: &mut impl OrganizationTransaction,
    caller: &Caller,
    copy_id: &str,
) -> Result<ProtectableCopy, Problem> {
    tx.lock_copy(copy_id)
        .await?
        .filter(|copy| copy.owner_id == caller.collection_owner() && copy.copy_id == copy_id)
        .ok_or(Problem::not_found("copy_id"))
}
