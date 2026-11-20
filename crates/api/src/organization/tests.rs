use super::*;
use mtgscan_application::organization::{OrganizationTransaction, ProtectableCopy, UserTag};
use mtgscan_domain::Caller;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

const COPY: &str = "10000000-0000-4000-8000-00000000000a";
const OTHER_COPY: &str = "10000000-0000-4000-8000-00000000000b";
const HELD_COPY: &str = "10000000-0000-4000-8000-00000000000c";
const ALLOCATED_COPY: &str = "10000000-0000-4000-8000-00000000000d";
const TAG: &str = "20000000-0000-4000-8000-000000000001";
const DELETED_TAG: &str = "20000000-0000-4000-8000-000000000002";

struct Identity(Result<Caller, Refusal>);

impl VerifyIdentity for Identity {
    async fn verify(&self, credential: &str) -> Result<Caller, Refusal> {
        assert_eq!(credential, "fixture");
        self.0.clone()
    }
}

fn owner() -> Caller {
    Caller::user("owner".into())
}

fn ai_client() -> Caller {
    Caller::ai_client("owner".into(), "client".into())
}

fn user_tag(deleted: bool) -> UserTag {
    UserTag {
        user_tag_id: if deleted { DELETED_TAG } else { TAG }.into(),
        name: if deleted { "Retired" } else { "Trade" }.into(),
        deleted,
        copy_count: 2,
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Event {
    Begin(Caller),
    List(bool),
    Create(String),
    Rename(String, String),
    SetDeleted(String, bool),
    Lock(String),
    Protect(String, bool),
    Link(String, String, bool),
    Commit,
}

#[derive(Clone, Default)]
struct Store {
    events: Arc<Mutex<Vec<Event>>>,
    retired_name_taken: bool,
}

struct Transaction(Store);

impl Store {
    fn record(&self, event: Event) {
        self.events.lock().unwrap().push(event);
    }

    fn take(&self) -> Vec<Event> {
        std::mem::take(&mut *self.events.lock().unwrap())
    }
}

impl OrganizationStore for Store {
    type Transaction = Transaction;

    async fn begin(&self, caller: &Caller) -> Result<Self::Transaction, Problem> {
        self.record(Event::Begin(caller.clone()));
        Ok(Transaction(self.clone()))
    }
}

impl OrganizationTransaction for Transaction {
    async fn lock_copy(&mut self, id: &str) -> Result<Option<ProtectableCopy>, Problem> {
        self.0.record(Event::Lock(id.into()));
        Ok(match id {
            COPY | OTHER_COPY | HELD_COPY | ALLOCATED_COPY => Some(ProtectableCopy {
                owner_id: if id == OTHER_COPY {
                    "other owner"
                } else {
                    "owner"
                }
                .into(),
                copy_id: id.into(),
                allocated: id == ALLOCATED_COPY,
                held: id == HELD_COPY,
            }),
            _ => None,
        })
    }

    async fn protect(&mut self, id: &str, protected: bool) -> Result<(), Problem> {
        self.0.record(Event::Protect(id.into(), protected));
        Ok(())
    }

    async fn find_user_tag_by_name(&mut self, name: &str) -> Result<Option<UserTag>, Problem> {
        Ok(
            (self.0.retired_name_taken && name == "Retired").then(|| UserTag {
                user_tag_id: "20000000-0000-4000-8000-000000000003".into(),
                name: name.into(),
                ..user_tag(false)
            }),
        )
    }

    async fn create_user_tag(&mut self, name: &str) -> Result<(UserTag, bool), Problem> {
        self.0.record(Event::Create(name.into()));
        Ok((
            UserTag {
                name: name.into(),
                ..user_tag(false)
            },
            name != "Trade",
        ))
    }

    async fn user_tags(&mut self, deleted: bool) -> Result<Vec<UserTag>, Problem> {
        self.0.record(Event::List(deleted));
        Ok(vec![user_tag(deleted)])
    }

    async fn user_tag(&mut self, id: &str) -> Result<Option<UserTag>, Problem> {
        Ok(match id {
            TAG => Some(user_tag(false)),
            DELETED_TAG => Some(user_tag(true)),
            _ => None,
        })
    }

    async fn rename_user_tag(&mut self, id: &str, name: &str) -> Result<(), Problem> {
        self.0.record(Event::Rename(id.into(), name.into()));
        Ok(())
    }

    async fn delete_user_tag(&mut self, id: &str, deleted: bool) -> Result<(), Problem> {
        self.0.record(Event::SetDeleted(id.into(), deleted));
        Ok(())
    }

    async fn set_copy_user_tag(
        &mut self,
        id: &str,
        copy_id: &str,
        tagged: bool,
    ) -> Result<(), Problem> {
        self.0
            .record(Event::Link(id.into(), copy_id.into(), tagged));
        Ok(())
    }

    async fn commit(self) -> Result<(), Problem> {
        self.0.record(Event::Commit);
        Ok(())
    }
}

fn protocol_cases() -> [(Value, Value); 7] {
    [
        (
            json!({"action":"list_user_tags","deleted":false}),
            json!({"items":[{"user_tag_id":TAG,"name":"Trade","copy_count":2}]}),
        ),
        (
            json!({"action":"create_user_tag","name":" New "}),
            json!({"user_tag_id":TAG,"name":"New"}),
        ),
        (
            json!({"action":"rename_user_tag","user_tag_id":TAG,"name":"Rename"}),
            json!({"user_tag_id":TAG,"name":"Rename"}),
        ),
        (
            json!({"action":"delete_user_tag","user_tag_id":TAG}),
            Value::Null,
        ),
        (
            json!({"action":"restore_user_tag","user_tag_id":DELETED_TAG}),
            json!({"user_tag_id":DELETED_TAG,"name":"Retired","changed":true,"copy_count":2}),
        ),
        (
            json!({"action":"set_copy_user_tag","copy_id":COPY.to_uppercase(),"user_tag_id":TAG,"tagged":false}),
            Value::Null,
        ),
        (
            json!({"action":"set_copy_protected","copy_id":COPY.to_uppercase(),"protected":true}),
            json!({"copy_id":COPY,"protected":true}),
        ),
    ]
}

async fn request(
    identity: &Identity,
    store: &Store,
    authorization: Option<&str>,
    body: &Value,
) -> CollectionResponse {
    organization_response(
        identity,
        store,
        authorization,
        "",
        &serde_json::to_vec(body).unwrap(),
    )
    .await
}

fn assert_refusal(reply: CollectionResponse, status: u16, code: &str, field: Option<&str>) {
    assert_eq!(reply.status, status);
    assert_eq!(reply.body, json!({"error":{"code":code,"field":field}}));
}

#[tokio::test]
async fn all_seven_app_actions_use_the_verified_user_and_return_the_native_reply_shape() {
    let store = Store::default();
    for (body, expected) in protocol_cases() {
        let reply = request(
            &Identity(Ok(owner())),
            &store,
            Some("Bearer fixture"),
            &body,
        )
        .await;
        assert_eq!(reply.status, 200, "{body}");
        assert_eq!(reply.body, expected, "{body}");
        let mut events = vec![Event::Begin(owner())];
        match body["action"].as_str().unwrap() {
            "list_user_tags" => events.push(Event::List(false)),
            "create_user_tag" => events.push(Event::Create("New".into())),
            "rename_user_tag" => events.push(Event::Rename(TAG.into(), "Rename".into())),
            "delete_user_tag" => events.push(Event::SetDeleted(TAG.into(), true)),
            "restore_user_tag" => events.push(Event::SetDeleted(DELETED_TAG.into(), false)),
            "set_copy_user_tag" => events.extend([
                Event::Lock(COPY.into()),
                Event::Link(TAG.into(), COPY.into(), false),
            ]),
            "set_copy_protected" => {
                events.extend([Event::Lock(COPY.into()), Event::Protect(COPY.into(), true)])
            }
            action => panic!("Unexpected fixture action: {action}"),
        }
        events.push(Event::Commit);
        assert_eq!(store.take(), events, "{body}");
    }
}

#[tokio::test]
async fn none_of_the_seven_app_actions_reaches_the_port_without_a_verified_user() {
    let store = Store::default();
    for (body, _) in protocol_cases() {
        for (authorization, identity, status, code) in [
            (None, Ok(owner()), 401, "unauthenticated"),
            (
                Some("Bearer fixture"),
                Err(Refusal::Unauthenticated),
                401,
                "unauthenticated",
            ),
            (
                Some("Bearer fixture"),
                Err(Refusal::Unavailable),
                503,
                "unavailable",
            ),
            (
                Some("Bearer fixture"),
                Ok(ai_client()),
                403,
                "mcp_token_forbidden",
            ),
        ] {
            let reply = request(&Identity(identity), &store, authorization, &body).await;
            assert_refusal(reply, status, code, None);
            assert!(store.take().is_empty(), "{body}");
        }
        let command = organization_contract::parse(body).unwrap();
        assert_eq!(
            organize(&store, &ai_client(), command).await,
            Err(Refusal::McpTokenForbidden.into())
        );
        assert!(store.take().is_empty());
    }
}

#[tokio::test]
async fn refusals_use_canonical_fields_and_never_return_unknown_keys() {
    let store = Store::default();
    let identity = Identity(Ok(owner()));
    for (body, field) in [
        (
            json!({"action":"create_user_tag","name":"Trade","fixture.note":"fixture"}),
            None,
        ),
        (
            json!({"action":"create_user_tag","name":"Trade","created_by":"fixture"}),
            None,
        ),
        (
            json!({"action":"create_user_tag","name":"Trade","updated_by":"fixture"}),
            None,
        ),
        (
            json!({"action":"create_user_tag","name":"Trade","owner_id":"fixture"}),
            None,
        ),
        (json!({"action":"create_user_tag"}), Some("name")),
        (
            json!({"action":"set_copy_protected","copy_id":"not a UUID","protected":true}),
            Some("copy_id"),
        ),
        (
            json!({"action":"set_copy_user_tag","copy_id":COPY,"user_tag_id":null,"tagged":true}),
            Some("user_tag_id"),
        ),
        (
            json!({"action":"list_user_tags","deleted":"false"}),
            Some("deleted"),
        ),
        (json!({"action":"fixture"}), Some("action")),
    ] {
        assert_refusal(
            request(&identity, &store, Some("Bearer fixture"), &body).await,
            400,
            "invalid_argument",
            field,
        );
    }
    let bulk =
        json!({"action":"set_copies_user_tag","copy_ids":[COPY],"user_tag_id":TAG,"tagged":true});
    assert_refusal(
        request(&identity, &store, Some("Bearer fixture"), &bulk).await,
        403,
        "forbidden",
        None,
    );
    assert!(store.take().is_empty());
}

#[tokio::test]
async fn held_and_allocated_copies_cannot_be_protected_but_can_be_unprotected() {
    let store = Store::default();
    let identity = Identity(Ok(owner()));
    for copy_id in [HELD_COPY, ALLOCATED_COPY] {
        let body = |protected| json!({"action":"set_copy_protected","copy_id":copy_id,"protected":protected});
        let reply = request(&identity, &store, Some("Bearer fixture"), &body(true)).await;
        assert_refusal(reply, 400, "copy_not_free", Some("copy_id"));
        assert_eq!(
            store.take(),
            [Event::Begin(owner()), Event::Lock(copy_id.into())]
        );

        let reply = request(&identity, &store, Some("Bearer fixture"), &body(false)).await;
        assert_eq!(reply.status, 200);
        assert_eq!(reply.body, json!({"copy_id":copy_id,"protected":false}));
        assert_eq!(
            store.take(),
            [
                Event::Begin(owner()),
                Event::Lock(copy_id.into()),
                Event::Protect(copy_id.into(), false),
                Event::Commit
            ]
        );
    }
}

#[tokio::test]
async fn rename_and_restore_report_name_collisions_without_writes() {
    let store = Store {
        retired_name_taken: true,
        ..Store::default()
    };
    let identity = Identity(Ok(owner()));
    for (body, field) in [
        (
            json!({"action":"rename_user_tag","user_tag_id":TAG,"name":"Retired"}),
            "name",
        ),
        (
            json!({"action":"restore_user_tag","user_tag_id":DELETED_TAG}),
            "user_tag_id",
        ),
    ] {
        assert_refusal(
            request(&identity, &store, Some("Bearer fixture"), &body).await,
            400,
            "user_tag_exists",
            Some(field),
        );
        assert_eq!(store.take(), [Event::Begin(owner())]);
    }
}

#[tokio::test]
async fn restoring_an_active_user_tag_does_not_rewrite_it() {
    let store = Store::default();
    let identity = Identity(Ok(owner()));
    let body = json!({"action":"restore_user_tag","user_tag_id":TAG});
    let reply = request(&identity, &store, Some("Bearer fixture"), &body).await;
    assert_eq!(reply.status, 200);
    assert_eq!(
        reply.body,
        json!({"user_tag_id":TAG,"name":"Trade","copy_count":2,"changed":false})
    );
    assert_eq!(store.take(), [Event::Begin(owner()), Event::Commit]);
}

#[tokio::test]
async fn a_duplicate_create_and_a_copy_owned_by_someone_else_commit_nothing() {
    let store = Store::default();
    let identity = Identity(Ok(owner()));
    let duplicate = json!({"action":"create_user_tag","name":"Trade"});
    assert_refusal(
        request(&identity, &store, Some("Bearer fixture"), &duplicate).await,
        400,
        "user_tag_exists",
        Some("name"),
    );
    assert_eq!(
        store.take(),
        [Event::Begin(owner()), Event::Create("Trade".into())]
    );

    for body in [
        json!({"action":"set_copy_protected","copy_id":OTHER_COPY,"protected":false}),
        json!({"action":"set_copy_user_tag","copy_id":OTHER_COPY,"user_tag_id":TAG,"tagged":true}),
    ] {
        assert_refusal(
            request(&identity, &store, Some("Bearer fixture"), &body).await,
            400,
            "not_found",
            Some("copy_id"),
        );
        assert_eq!(
            store.take(),
            [Event::Begin(owner()), Event::Lock(OTHER_COPY.into())]
        );
    }
}
