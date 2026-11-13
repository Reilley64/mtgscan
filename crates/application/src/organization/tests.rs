use super::*;
use std::sync::{Arc, Mutex};

async fn organize(
    identity: &impl VerifyIdentity,
    store: &impl OrganizationStore,
    credential: Option<&str>,
    command: Command,
) -> Result<Outcome, Problem> {
    super::organize(identity, store, credential, command)
        .await
        .map(|reply| reply.outcome)
}

struct Auth;
impl VerifyIdentity for Auth {
    async fn verify(&self, token: &str) -> Result<Caller, Refusal> {
        match token {
            "invalid" => Err(Refusal::Unauthenticated),
            "ai" => Ok(Caller::ai_client("owner".into(), "client".into())),
            "other" => Ok(Caller::user("other".into())),
            _ => Ok(Caller::user("owner".into())),
        }
    }
}

#[tokio::test]
async fn a_user_gets_a_duplicate_error_but_ai_create_reuses_the_user_tag_without_renaming_it() {
    let db = database();
    let created = organize(
        &Auth,
        &db,
        Some("user"),
        Command::CreateUserTag {
            name: "  Signed ".into(),
        },
    )
    .await
    .unwrap();
    let Outcome::Created {
        user_tag,
        created: true,
    } = created
    else {
        panic!("new user tag expected")
    };
    assert_eq!(user_tag.name, "Signed");
    assert_eq!(
        organize(
            &Auth,
            &db,
            Some("user"),
            Command::CreateUserTag {
                name: "SIGNED".into()
            }
        )
        .await,
        Err(Problem::new("user_tag_exists", Some("name")))
    );
    assert_eq!(
        organize(
            &Auth,
            &db,
            Some("ai"),
            Command::CreateUserTag {
                name: "SIGNED".into()
            }
        )
        .await,
        Ok(Outcome::Created {
            user_tag,
            created: false
        })
    );
}

async fn command(db: &Database, action: Command) -> Result<Outcome, Problem> {
    organize(&Auth, db, Some("user"), action).await
}
async fn new_user_tag(db: &Database, name: &str) -> UserTag {
    let Outcome::Created { user_tag, .. } =
        command(db, Command::CreateUserTag { name: name.into() })
            .await
            .unwrap()
    else {
        panic!()
    };
    user_tag
}

#[tokio::test]
async fn deletion_retains_links_detach_stays_detached_and_restoration_refuses_a_reused_name() {
    let db = database();
    let user_tag = new_user_tag(&db, "Signed").await;
    let id = user_tag.user_tag_id;
    command(
        &db,
        Command::SetUserTag {
            user_tag_id: id.clone(),
            copy_ids: vec!["first".into(), "second".into()],
            tagged: true,
            single: false,
        },
    )
    .await
    .unwrap();
    command(
        &db,
        Command::SetUserTag {
            user_tag_id: id.clone(),
            copy_ids: vec!["second".into()],
            tagged: false,
            single: true,
        },
    )
    .await
    .unwrap();
    command(
        &db,
        Command::DeleteUserTag {
            user_tag_id: id.clone(),
        },
    )
    .await
    .unwrap();
    let replacement = new_user_tag(&db, "SIGNED").await;
    assert_ne!(replacement.user_tag_id, id);
    assert_eq!(
        command(
            &db,
            Command::RestoreUserTag {
                user_tag_id: id.clone()
            }
        )
        .await,
        Err(Problem::new("user_tag_exists", Some("user_tag_id")))
    );
    command(
        &db,
        Command::RenameUserTag {
            user_tag_id: replacement.user_tag_id,
            name: "Sell".into(),
        },
    )
    .await
    .unwrap();
    let Outcome::Restored { user_tag, changed } = command(
        &db,
        Command::RestoreUserTag {
            user_tag_id: id.clone(),
        },
    )
    .await
    .unwrap() else {
        panic!()
    };
    assert!(changed);
    assert_eq!(user_tag.copy_count, 1);
    assert_eq!(user_tag.name, "Signed");
    let Outcome::UserTags(active) = command(&db, Command::ListUserTags { deleted: false })
        .await
        .unwrap()
    else {
        panic!()
    };
    assert!(
        active
            .iter()
            .any(|user_tag| user_tag.user_tag_id == id && user_tag.copy_count == 1)
    );
    assert_eq!(
        command(&db, Command::ListUserTags { deleted: true }).await,
        Ok(Outcome::UserTags(vec![]))
    );
    let state = db.state.lock().unwrap();
    assert_eq!(
        state.links,
        vec![
            ("first".into(), id.clone(), true),
            ("second".into(), id, false)
        ]
    );
}

#[tokio::test]
async fn ai_bulk_user_tag_changes_skip_missing_copies_in_request_order_and_attribute_the_verified_client()
 {
    let db = database();
    let user_tag = new_user_tag(&db, "Signed").await;
    let action = Command::SetUserTag {
        user_tag_id: user_tag.user_tag_id.clone(),
        copy_ids: vec![
            "absent".into(),
            "second".into(),
            "first".into(),
            "others".into(),
        ],
        tagged: true,
        single: false,
    };
    let expected = Outcome::UserTagLinksChanged {
        changed: vec!["second".into(), "first".into()],
        skipped: vec!["absent".into(), "others".into()],
    };
    assert_eq!(
        organize(&Auth, &db, Some("ai"), action.clone()).await,
        Ok(expected.clone())
    );
    assert_eq!(organize(&Auth, &db, Some("ai"), action).await, Ok(expected));
    assert_eq!(db.state.lock().unwrap().actor, "client");
    assert_eq!(
        command(
            &db,
            Command::SetUserTag {
                user_tag_id: user_tag.user_tag_id,
                copy_ids: vec!["absent".into()],
                tagged: false,
                single: true
            }
        )
        .await,
        Err(Problem::not_found("copy_id"))
    );
}

#[tokio::test]
async fn user_tag_limits_fail_before_any_link_changes_and_names_count_characters_after_trimming() {
    let db = database();
    let user_tag = new_user_tag(&db, &"é".repeat(64)).await;
    for (ids, field) in [
        (vec![], "copy_ids"),
        ((0..101).map(|n| n.to_string()).collect(), "copy_ids"),
        (vec!["first".into(), "FIRST".into()], "copy_ids[1]"),
    ] {
        assert_eq!(
            command(
                &db,
                Command::SetUserTag {
                    user_tag_id: user_tag.user_tag_id.clone(),
                    copy_ids: ids,
                    tagged: true,
                    single: false
                }
            )
            .await,
            Err(Problem::new("invalid_argument", Some(field)))
        );
    }
    for name in [" \n\t".to_string(), "é".repeat(65)] {
        assert_eq!(
            command(&db, Command::CreateUserTag { name }).await,
            Err(Problem::new("invalid_argument", Some("name")))
        );
    }
    assert!(db.state.lock().unwrap().links.is_empty());
}

#[tokio::test]
async fn user_tag_ownership_deleted_state_retry_behavior_and_rename_conflicts_are_preserved() {
    let db = database();
    let user_tag = new_user_tag(&db, "Signed").await;
    let sell = new_user_tag(&db, "Sell").await;
    assert_eq!(
        command(
            &db,
            Command::RenameUserTag {
                user_tag_id: sell.user_tag_id,
                name: "SIGNED".into()
            }
        )
        .await,
        Err(Problem::new("user_tag_exists", Some("name")))
    );
    for action in [
        Command::DeleteUserTag {
            user_tag_id: user_tag.user_tag_id.clone(),
        },
        Command::RestoreUserTag {
            user_tag_id: user_tag.user_tag_id.clone(),
        },
        Command::RenameUserTag {
            user_tag_id: user_tag.user_tag_id.clone(),
            name: "Other".into(),
        },
    ] {
        assert_eq!(
            organize(&Auth, &db, Some("other"), action).await,
            Err(Problem::not_found("user_tag_id"))
        );
    }
    command(
        &db,
        Command::DeleteUserTag {
            user_tag_id: user_tag.user_tag_id.clone(),
        },
    )
    .await
    .unwrap();
    assert_eq!(
        command(
            &db,
            Command::DeleteUserTag {
                user_tag_id: user_tag.user_tag_id.clone()
            }
        )
        .await,
        Err(Problem::not_found("user_tag_id"))
    );
    assert_eq!(
        organize(
            &Auth,
            &db,
            Some("ai"),
            Command::DeleteUserTag {
                user_tag_id: user_tag.user_tag_id.clone()
            }
        )
        .await,
        Ok(Outcome::Deleted {
            user_tag_id: user_tag.user_tag_id.clone(),
            changed: false,
            copy_count: 0
        })
    );
    assert_eq!(
        command(
            &db,
            Command::SetUserTag {
                user_tag_id: user_tag.user_tag_id,
                copy_ids: vec!["first".into()],
                tagged: true,
                single: true
            }
        )
        .await,
        Err(Problem::not_found("user_tag_id"))
    );
    let Outcome::UserTags(user_tags) = command(&db, Command::ListUserTags { deleted: true })
        .await
        .unwrap()
    else {
        panic!()
    };
    assert_eq!(user_tags.len(), 1);
    assert_eq!(user_tags[0].name, "Signed");
}

#[tokio::test]
async fn a_hundred_exact_copy_links_commit_together_and_failed_commits_leave_no_links() {
    let mut db = database();
    let ids: Vec<String> = (0..100).map(|index| format!("copy-{index}")).collect();
    db.state.lock().unwrap().copies = ids
        .iter()
        .map(|id| {
            (
                ProtectableCopy {
                    owner_id: "owner".into(),
                    copy_id: id.clone(),
                    allocated: false,
                    held: false,
                },
                false,
            )
        })
        .collect();
    let user_tag = new_user_tag(&db, "Signed").await;
    let action = Command::SetUserTag {
        user_tag_id: user_tag.user_tag_id,
        copy_ids: ids.clone(),
        tagged: true,
        single: false,
    };
    db.fail_commit = true;
    assert_eq!(
        command(&db, action.clone()).await,
        Err(Problem::unavailable())
    );
    assert!(db.state.lock().unwrap().links.is_empty());
    db.fail_commit = false;
    assert_eq!(
        command(&db, action).await,
        Ok(Outcome::UserTagLinksChanged {
            changed: ids,
            skipped: vec![]
        })
    );
    assert_eq!(db.state.lock().unwrap().links.len(), 100);
}

#[tokio::test]
async fn user_tag_names_are_unique_per_owner_and_restoring_an_active_user_tag_is_a_noop() {
    let db = database();
    let user_tag = new_user_tag(&db, "Signed").await;
    let Outcome::Created {
        user_tag: other,
        created: true,
    } = organize(
        &Auth,
        &db,
        Some("other"),
        Command::CreateUserTag {
            name: "SIGNED".into(),
        },
    )
    .await
    .unwrap()
    else {
        panic!()
    };
    assert_ne!(user_tag.user_tag_id, other.user_tag_id);
    assert_eq!(
        command(
            &db,
            Command::RestoreUserTag {
                user_tag_id: user_tag.user_tag_id.clone()
            }
        )
        .await,
        Ok(Outcome::Restored {
            user_tag: user_tag.clone(),
            changed: false
        })
    );
    let Outcome::Renamed(renamed) = command(
        &db,
        Command::RenameUserTag {
            user_tag_id: user_tag.user_tag_id.clone(),
            name: "SIGNED".into(),
        },
    )
    .await
    .unwrap() else {
        panic!()
    };
    assert_eq!(renamed.user_tag_id, user_tag.user_tag_id);
    assert_eq!(renamed.name, "SIGNED");
    let Outcome::UserTags(user_tags) = command(&db, Command::ListUserTags { deleted: false })
        .await
        .unwrap()
    else {
        panic!()
    };
    assert_eq!(user_tags, [renamed]);
}

#[derive(Clone, Default)]
struct State {
    copies: Vec<(ProtectableCopy, bool)>,
    actor: String,
    user_tags: Vec<(String, UserTag)>,
    links: Vec<(String, String, bool)>,
}
#[derive(Default)]
struct Database {
    state: Arc<Mutex<State>>,
    fail_commit: bool,
}
struct Transaction {
    saved: Arc<Mutex<State>>,
    state: State,
    caller: Caller,
    fail_commit: bool,
}
impl OrganizationStore for Database {
    type Transaction = Transaction;
    async fn begin(&self, caller: &Caller) -> Result<Transaction, Problem> {
        Ok(Transaction {
            saved: self.state.clone(),
            state: self.state.lock().unwrap().clone(),
            caller: caller.clone(),
            fail_commit: self.fail_commit,
        })
    }
}
impl OrganizationTransaction for Transaction {
    async fn lock_copy(&mut self, id: &str) -> Result<Option<ProtectableCopy>, Problem> {
        Ok(self
            .state
            .copies
            .iter()
            .find(|(c, _)| c.copy_id == id && c.owner_id == self.caller.collection_owner())
            .map(|(c, _)| c.clone()))
    }
    async fn protect(&mut self, id: &str, protected: bool) -> Result<(), Problem> {
        self.state
            .copies
            .iter_mut()
            .find(|(c, _)| c.copy_id == id)
            .unwrap()
            .1 = protected;
        Ok(())
    }
    async fn find_user_tag_by_name(&mut self, name: &str) -> Result<Option<UserTag>, Problem> {
        Ok(self
            .state
            .user_tags
            .iter()
            .find(|(owner, t)| {
                owner == self.caller.collection_owner()
                    && !t.deleted
                    && t.name.to_lowercase() == name.to_lowercase()
            })
            .map(|(_, t)| t.clone()))
    }
    async fn create_user_tag(&mut self, name: &str) -> Result<(UserTag, bool), Problem> {
        if let Some(user_tag) = self.find_user_tag_by_name(name).await? {
            return Ok((user_tag, false));
        }
        let user_tag = UserTag {
            user_tag_id: format!("tag-{}", self.state.user_tags.len()),
            name: name.into(),
            deleted: false,
            copy_count: 0,
        };
        self.state
            .user_tags
            .push((self.caller.collection_owner().into(), user_tag.clone()));
        Ok((user_tag, true))
    }
    async fn user_tags(&mut self, deleted: bool) -> Result<Vec<UserTag>, Problem> {
        let ids = self
            .state
            .user_tags
            .iter()
            .filter(|(owner, t)| owner == self.caller.collection_owner() && t.deleted == deleted)
            .map(|(_, t)| t.user_tag_id.clone())
            .collect::<Vec<_>>();
        let mut user_tags = Vec::new();
        for id in ids {
            user_tags.push(self.user_tag(&id).await?.unwrap());
        }
        user_tags.sort_by_key(|t| (t.name.to_lowercase(), t.name.clone(), t.user_tag_id.clone()));
        Ok(user_tags)
    }
    async fn user_tag(&mut self, id: &str) -> Result<Option<UserTag>, Problem> {
        let Some((_, user_tag)) = self
            .state
            .user_tags
            .iter()
            .find(|(owner, t)| owner == self.caller.collection_owner() && t.user_tag_id == id)
        else {
            return Ok(None);
        };
        let mut user_tag = user_tag.clone();
        user_tag.copy_count = self
            .state
            .links
            .iter()
            .filter(|(_, t, active)| t == id && *active)
            .count() as i64;
        Ok(Some(user_tag))
    }
    async fn rename_user_tag(&mut self, id: &str, name: &str) -> Result<(), Problem> {
        self.state
            .user_tags
            .iter_mut()
            .find(|(_, t)| t.user_tag_id == id)
            .unwrap()
            .1
            .name = name.into();
        Ok(())
    }
    async fn delete_user_tag(&mut self, id: &str, deleted: bool) -> Result<(), Problem> {
        self.state
            .user_tags
            .iter_mut()
            .find(|(_, t)| t.user_tag_id == id)
            .unwrap()
            .1
            .deleted = deleted;
        Ok(())
    }
    async fn set_user_tag(
        &mut self,
        id: &str,
        copies: &[String],
        tagged: bool,
    ) -> Result<(), Problem> {
        for copy in copies {
            if let Some(link) = self
                .state
                .links
                .iter_mut()
                .find(|(c, t, _)| c == copy && t == id)
            {
                link.2 = tagged;
            } else if tagged {
                self.state.links.push((copy.clone(), id.into(), true));
            }
        }
        Ok(())
    }
    async fn commit(mut self) -> Result<(), Problem> {
        if self.fail_commit {
            return Err(Problem::unavailable());
        }
        self.state.actor = self.caller.actor_id().into();
        *self.saved.lock().unwrap() = self.state;
        Ok(())
    }
}
fn database() -> Database {
    let db = Database::default();
    db.state.lock().unwrap().copies = ["first", "second"]
        .map(|id| {
            (
                ProtectableCopy {
                    owner_id: "owner".into(),
                    copy_id: id.into(),
                    allocated: false,
                    held: false,
                },
                false,
            )
        })
        .to_vec();
    db
}
async fn protect(db: &Database, credential: Option<&str>, id: &str) -> Result<Outcome, Problem> {
    organize(
        &Auth,
        db,
        credential,
        Command::Protect {
            copy_id: id.into(),
            protected: true,
        },
    )
    .await
}
#[tokio::test]
async fn protection_changes_only_the_exact_copy_and_refuses_ai_wrong_owner_or_missing_credentials()
{
    let db = database();
    assert_eq!(
        protect(&db, None, "first").await,
        Err(Problem::new("unauthenticated", None))
    );
    assert_eq!(
        protect(&db, Some("invalid"), "first").await,
        Err(Problem::new("unauthenticated", None))
    );
    assert_eq!(
        protect(&db, Some("ai"), "first").await,
        Err(Problem::new("mcp_token_forbidden", None))
    );
    assert_eq!(
        protect(&db, Some("other"), "first").await,
        Err(Problem::not_found("copy_id"))
    );
    assert_eq!(
        protect(&db, Some("user"), "first").await,
        Ok(Outcome::Protected {
            copy_id: "first".into(),
            protected: true
        })
    );
    let state = db.state.lock().unwrap();
    assert!(state.copies[0].1);
    assert!(!state.copies[1].1);
    assert_eq!(state.actor, "owner");
}
#[tokio::test]
async fn a_failed_transaction_returns_no_success_and_commits_no_protection() {
    let mut db = database();
    db.fail_commit = true;
    assert_eq!(
        protect(&db, Some("user"), "first").await,
        Err(Problem::unavailable())
    );
    assert!(!db.state.lock().unwrap().copies[0].1);
}
