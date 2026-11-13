use crate::deck_contract::{deck_contents, deck_summary};
use axum::{
    Json, Router,
    body::Bytes,
    extract::{Path, RawQuery, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use mtgscan_application::{VerifyIdentity, decks::*};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;

pub const DECKS_PATH: &str = "/api/v1/decks";
pub const DECK_PATH: &str = "/api/v1/decks/{deck_id}";
pub const METADATA_PATH: &str = "/api/v1/decks/{deck_id}/metadata";

struct Services<I, D> {
    identity: I,
    database: D,
}

pub fn router<I, D>(identity: I, database: D) -> Router
where
    I: VerifyIdentity + 'static,
    D: ReadDecks + ReadDeckContents + WriteDeckMetadata + 'static,
{
    Router::new()
        .route(DECKS_PATH, get(list::<I, D>).post(create::<I, D>))
        .route(DECK_PATH, get(contents::<I, D>))
        .route(METADATA_PATH, post(metadata::<I, D>))
        .with_state(Arc::new(Services { identity, database }))
}

fn credential(headers: &HeaderMap) -> Option<&str> {
    if headers.get_all(header::AUTHORIZATION).iter().count() != 1 {
        return None;
    }
    let (scheme, token) = headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .split_once(' ')?;
    (scheme.eq_ignore_ascii_case("bearer")
        && !token.is_empty()
        && !token.chars().any(char::is_whitespace))
    .then_some(token)
}

fn response(status: u16, body: Value) -> Response {
    let mut response = (StatusCode::from_u16(status).unwrap(), Json(body)).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    if status == 401 {
        response
            .headers_mut()
            .insert(header::WWW_AUTHENTICATE, "Bearer".parse().unwrap());
    }
    response
}

fn refused(error: DeckRefusal) -> Response {
    let (status, code, field) = match error {
        DeckRefusal::Unauthenticated => (401, "unauthenticated", None),
        DeckRefusal::Forbidden => (403, "forbidden", None),
        DeckRefusal::NotFound => (404, "not_found", Some("deck_id")),
        DeckRefusal::Unavailable => (503, "unavailable", None),
        DeckRefusal::InvalidName => (400, "invalid_argument", Some("name")),
    };
    response(status, json!({"error":{"code":code,"field":field}}))
}

fn invalid(field: &str) -> Response {
    response(
        400,
        json!({"error":{"code":"invalid_argument","field":field}}),
    )
}

async fn list<I: VerifyIdentity, D: ReadDecks>(
    State(s): State<Arc<Services<I, D>>>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
) -> Response {
    if query.is_some_and(|q| !q.is_empty()) {
        return invalid("query");
    }
    match browse_decks(&s.identity, &s.database, credential(&headers)).await {
        Ok(decks) => response(
            200,
            json!({"items":decks.iter().map(deck_summary).collect::<Vec<_>>()}),
        ),
        Err(error) => refused(error),
    }
}

async fn contents<I: VerifyIdentity, D: ReadDeckContents>(
    State(s): State<Arc<Services<I, D>>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    RawQuery(query): RawQuery,
) -> Response {
    if query.is_some_and(|q| !q.is_empty()) {
        return invalid("query");
    }
    let Ok(id) = uuid::Uuid::parse_str(&id) else {
        return invalid("deck_id");
    };
    match get_deck(
        &s.identity,
        &s.database,
        credential(&headers),
        &id.to_string(),
    )
    .await
    {
        Ok(deck) => response(200, deck_contents(&deck)),
        Err(error) => refused(error),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateRequest {
    name: String,
}

async fn create<I: VerifyIdentity, D: WriteDeckMetadata>(
    State(s): State<Arc<Services<I, D>>>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
    body: Bytes,
) -> Response {
    if query.is_some_and(|q| !q.is_empty()) {
        return invalid("query");
    }
    let Ok(request) = serde_json::from_slice::<CreateRequest>(&body) else {
        return invalid("request");
    };
    match create_deck(
        &s.identity,
        &s.database,
        credential(&headers),
        &request.name,
    )
    .await
    {
        Ok(id) => response(201, json!({"deck_id":id})),
        Err(error) => refused(error),
    }
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
enum MetadataRequest {
    Rename { name: String },
    Priority { priority: Priority },
    Used {},
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum Priority {
    High,
    Medium,
    Low,
}

async fn metadata<I: VerifyIdentity, D: WriteDeckMetadata>(
    State(s): State<Arc<Services<I, D>>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    RawQuery(query): RawQuery,
    body: Bytes,
) -> Response {
    if query.is_some_and(|q| !q.is_empty()) {
        return invalid("query");
    }
    let Ok(id) = uuid::Uuid::parse_str(&id) else {
        return invalid("deck_id");
    };
    let Ok(request) = serde_json::from_slice::<MetadataRequest>(&body) else {
        return invalid("request");
    };
    let change = match request {
        MetadataRequest::Rename { name } => match DeckName::new(&name) {
            Ok(name) => MetadataChange::Rename(name),
            Err(error) => return refused(error),
        },
        MetadataRequest::Priority { priority } => MetadataChange::Priority(match priority {
            Priority::High => DeckPriority::High,
            Priority::Medium => DeckPriority::Medium,
            Priority::Low => DeckPriority::Low,
        }),
        MetadataRequest::Used {} => MetadataChange::Used,
    };
    match edit_deck_metadata(
        &s.identity,
        &s.database,
        credential(&headers),
        &id.to_string(),
        change,
    )
    .await
    {
        Ok(()) => response(200, Value::Null),
        Err(error) => refused(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::Request,
    };
    use mtgscan_domain::{Caller, Refusal};
    use tower::ServiceExt;

    struct Identity;
    impl VerifyIdentity for Identity {
        async fn verify(&self, token: &str) -> Result<Caller, Refusal> {
            match token {
                "invalid" => Err(Refusal::Unauthenticated),
                "ai" => Ok(Caller::ai_client("owner-a".into(), "client-a".into())),
                _ => Ok(Caller::user("owner-a".into())),
            }
        }
    }
    #[tokio::test]
    async fn deck_contents_and_gallery_use_the_canonical_projection_without_losing_stored_metadata()
    {
        let (status, body) = request(
            "GET",
            "/api/v1/decks/40000000-0000-4000-8000-000000000001",
            Some("owner"),
            "",
        )
        .await;
        assert_eq!(status, 200);
        let expected: Value = serde_json::from_str(include_str!("../fixtures/deck.json")).unwrap();
        assert_eq!(body, expected);
    }

    fn sample_deck() -> DeckContents {
        use mtgscan_domain::decks::*;
        DeckContents {
            summary: DeckSummary {
                deck_id: "40000000-0000-4000-8000-000000000001".into(),
                name: "Same name".into(),
                priority: "high".into(),
                revision: 7,
                card_count: 9,
                last_used_at: "2026-11-02T00:00:00.000000Z".into(),
                commanders: vec![Commander {
                    copy_id: "10000000-0000-4000-8000-000000000001".into(),
                    name: "Sol Ring".into(),
                    art_crop_uri: Some("https://example.test/art.jpg".into()),
                }],
                evaluation: Some(EvaluationSummary {
                    validity: "invalid".into(),
                    validity_stale: true,
                    estimated_bracket: 3,
                    bracket_stale: true,
                }),
                needs_you_count: 2,
            },
            created_at: "2026-10-01T00:00:00Z".into(),
            cards: vec![DeckCard {
                copy_id: "10000000-0000-4000-8000-000000000001".into(),
                printing_id: "20000000-0000-4000-8000-000000000001".into(),
                name: "Sol Ring".into(),
                set: "c21".into(),
                collector_number: "263".into(),
                rarity: "uncommon".into(),
                image_uris: vec!["https://example.test/card.jpg".into()],
                finish: "foil".into(),
                condition: "lightly_played".into(),
                language: "en".into(),
                protected: false,
                price: Some(CurrentPrice {
                    currency: "USD".into(),
                    amount: "1.50".into(),
                    finish: "foil".into(),
                    stale: false,
                }),
                role: "commander".into(),
                commander_at: Some("2026-11-01T01:00:00Z".into()),
                added_at: "2026-11-01T00:00:00Z".into(),
                type_line: "Artifact".into(),
                mana_value: 1.0,
                colors: vec![],
                planned_out: true,
            }],
            basic_lands: vec![
                BasicLand {
                    oracle_id: Some("30000000-0000-4000-8000-000000000001".into()),
                    name: "Island".into(),
                    image_uris: vec!["https://example.test/island.jpg".into()],
                    count: 8,
                },
                BasicLand {
                    oracle_id: None,
                    name: "Wastes".into(),
                    image_uris: vec![],
                    count: 0,
                },
            ],
            evaluation: Some(StoredEvaluation {
                summary: EvaluationSummary {
                    validity: "invalid".into(),
                    validity_stale: true,
                    estimated_bracket: 3,
                    bracket_stale: true,
                },
                violations: vec![Violation {
                    rule: "commander_eligibility".into(),
                    citation: None,
                    message: "Sol Ring cannot be a commander.".into(),
                    hint: None,
                    cards: vec![EvaluationCard::Copy {
                        copy_id: "10000000-0000-4000-8000-000000000001".into(),
                        name: "Sol Ring".into(),
                        image_uris: vec!["https://example.test/card.jpg".into()],
                    }],
                    colors: None,
                }],
                undetermined: vec![],
                chosen_color: None,
                bracket_signals: vec![],
                missing_signal_count: 1,
                revision: 7,
                catalog_at: Some("2026-11-01T00:00:00Z".into()),
                oracle_tags_at: None,
                commander_spellbook_at: None,
                judged_at: "2026-11-01T12:00:00Z".into(),
                validity_rules_data_at: Some("2026-11-01T00:00:00Z".into()),
                bracket_rules_data_at: Some("2026-11-01T00:00:00Z".into()),
                no_oracle_tag_data: true,
                no_combo_data: true,
            }),
        }
    }

    #[tokio::test]
    async fn all_metadata_actions_refuse_ai_and_cannot_accept_revision_or_owner_assertions() {
        let path = "/api/v1/decks/40000000-0000-4000-8000-000000000001/metadata";
        for body in [
            r#"{"action":"rename","name":"Same name"}"#,
            r#"{"action":"priority","priority":"low"}"#,
            r#"{"action":"used"}"#,
        ] {
            assert_eq!(request("POST", path, Some("ai"), body).await.0, 403);
            assert_eq!(request("POST", path, None, body).await.0, 401);
            assert_eq!(request("POST", path, Some("owner"), body).await.0, 404);
        }
        for body in [
            r#"{"action":"rename","name":"Same name","revision":8}"#,
            r#"{"action":"priority","priority":"urgent"}"#,
            r#"{"action":"used","updated_by":"forged"}"#,
            r#"{"action":"delete"}"#,
        ] {
            assert_eq!(request("POST", path, Some("owner"), body).await.0, 400);
        }
        assert_eq!(
            request("GET", "/api/v1/decks/not-a-uuid", Some("owner"), "")
                .await
                .0,
            400
        );
        assert_eq!(
            request(
                "GET",
                "/api/v1/decks/40000000-0000-4000-8000-000000000099",
                Some("owner"),
                ""
            )
            .await
            .0,
            404
        );
        assert_eq!(
            request("POST", "/api/v1/decks", Some("owner"), r#"{"name":"  "}"#)
                .await
                .0,
            400
        );
    }

    struct Database;
    impl ReadDecks for Database {
        async fn list(&self, _: &str) -> Result<Vec<OwnedDeckSummary>, DeckRefusal> {
            Ok(vec![])
        }
    }
    impl ReadDeckContents for Database {
        async fn get(
            &self,
            owner: &str,
            id: &str,
        ) -> Result<Option<OwnedDeckContents>, DeckRefusal> {
            Ok(
                (id == "40000000-0000-4000-8000-000000000001").then(|| OwnedDeckContents {
                    owner_id: owner.into(),
                    deck: sample_deck(),
                }),
            )
        }
    }
    impl WriteDeckMetadata for Database {
        async fn create(
            &self,
            owner: &str,
            name: &DeckName,
            priority: DeckPriority,
        ) -> Result<String, DeckRefusal> {
            assert_eq!(owner, "owner-a");
            assert_eq!(name.as_str(), "Same name");
            assert_eq!(priority, DeckPriority::Medium);
            Ok("10000000-0000-4000-8000-000000000001".into())
        }
        async fn metadata(
            &self,
            _: &str,
            _: &str,
        ) -> Result<Option<OwnedDeckSummary>, DeckRefusal> {
            Ok(None)
        }
        async fn edit(&self, _: &str, _: &str, _: &MetadataChange) -> Result<(), DeckRefusal> {
            Err(DeckRefusal::NotFound)
        }
    }

    async fn request(method: &str, path: &str, token: Option<&str>, body: &str) -> (u16, Value) {
        let mut builder = Request::builder()
            .method(method)
            .uri(path)
            .header("Content-Type", "application/json");
        if let Some(token) = token {
            builder = builder.header("Authorization", format!("Bearer {token}"));
        }
        let reply = router(Identity, Database)
            .oneshot(builder.body(Body::from(body.to_string())).unwrap())
            .await
            .unwrap();
        assert_eq!(reply.headers()["cache-control"], "no-store");
        let status = reply.status().as_u16();
        let bytes = to_bytes(reply.into_body(), 65536).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }

    #[tokio::test]
    async fn deck_routes_use_verified_identity_and_reject_owner_or_attribution_assertions() {
        assert_eq!(
            request("GET", "/api/v1/decks", Some("ai"), "").await,
            (200, json!({"items":[]}))
        );
        assert_eq!(request("GET", "/api/v1/decks", None, "").await.0, 401);
        assert_eq!(
            request("GET", "/api/v1/decks?owner=other", Some("owner"), "")
                .await
                .0,
            400
        );
        assert_eq!(
            request(
                "POST",
                "/api/v1/decks",
                Some("owner"),
                r#"{"name":" Same name "}"#
            )
            .await,
            (
                201,
                json!({"deck_id":"10000000-0000-4000-8000-000000000001"})
            )
        );
        for body in [
            r#"{"name":"Same name","owner":"other"}"#,
            r#"{"name":"Same name","created_by":"forged"}"#,
        ] {
            assert_eq!(
                request("POST", "/api/v1/decks", Some("owner"), body)
                    .await
                    .0,
                400
            );
        }
        assert_eq!(
            request(
                "POST",
                "/api/v1/decks",
                Some("ai"),
                r#"{"name":"Same name"}"#
            )
            .await
            .0,
            403
        );
    }
}
