use crate::collection_contract::{BrowseResult, CopyResult, FieldError, RefusedResult};
use crate::credentials::{authorization, bearer};
use axum::{
    Json, Router,
    extract::{Path, RawQuery, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use mtgscan_application::{
    VerifyIdentity,
    collection::{ReadCollection, browse_collection, open_copy},
};
use mtgscan_domain::collection::CollectionRefusal;
use serde_json::Value;
use std::sync::Arc;

pub const COLLECTION_PATH: &str = "/api/v1/collection/copies";
pub const COPY_PATH: &str = "/api/v1/collection/copies/{copy_id}";

pub struct CollectionResponse {
    pub status: u16,
    pub body: Value,
}

fn refused(refusal: CollectionRefusal, field: Option<&'static str>) -> CollectionResponse {
    let (status, code) = match refusal {
        CollectionRefusal::Unauthenticated => (401, "unauthenticated"),
        CollectionRefusal::Forbidden => (403, "forbidden"),
        CollectionRefusal::NotFound => (404, "not_found"),
        CollectionRefusal::Unavailable => (503, "unavailable"),
        CollectionRefusal::InvalidRequest => (400, "invalid_request"),
    };
    CollectionResponse {
        status,
        body: serde_json::to_value(RefusedResult {
            error: FieldError { code, field },
        })
        .unwrap(),
    }
}

pub async fn collection_response(
    identity: &impl VerifyIdentity,
    database: &impl ReadCollection,
    authorization: Option<&str>,
    query: &str,
    copy_id: Option<&str>,
) -> CollectionResponse {
    let credential = bearer(authorization);
    if credential.is_none() {
        return refused(CollectionRefusal::Unauthenticated, None);
    }
    if !query.is_empty() {
        return refused(CollectionRefusal::InvalidRequest, Some("query"));
    }
    if let Some(id) = copy_id {
        let Ok(id) = uuid::Uuid::parse_str(id) else {
            return refused(CollectionRefusal::InvalidRequest, Some("copy_id"));
        };
        match open_copy(identity, database, credential, &id.to_string()).await {
            Ok(copy) => CollectionResponse {
                status: 200,
                body: serde_json::to_value(CopyResult::from(copy)).unwrap(),
            },
            Err(error) => refused(error, None),
        }
    } else {
        match browse_collection(identity, database, credential).await {
            Ok(copies) => CollectionResponse {
                status: 200,
                body: serde_json::to_value(BrowseResult {
                    copies: copies.into_iter().map(CopyResult::from).collect(),
                })
                .unwrap(),
            },
            Err(error) => refused(error, None),
        }
    }
}

struct Services<I, D> {
    identity: I,
    database: D,
}

pub fn router<I: VerifyIdentity + 'static, D: ReadCollection + 'static>(
    identity: I,
    database: D,
) -> Router {
    Router::new()
        .route(COLLECTION_PATH, get(browse::<I, D>))
        .route(COPY_PATH, get(copy::<I, D>))
        .with_state(Arc::new(Services { identity, database }))
}

fn response(reply: CollectionResponse) -> Response {
    let mut result = (
        StatusCode::from_u16(reply.status).unwrap(),
        Json(reply.body),
    )
        .into_response();
    result
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    if reply.status == 401 {
        result
            .headers_mut()
            .insert(header::WWW_AUTHENTICATE, "Bearer".parse().unwrap());
    }
    result
}

async fn browse<I: VerifyIdentity, D: ReadCollection>(
    State(services): State<Arc<Services<I, D>>>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
) -> Response {
    response(
        collection_response(
            &services.identity,
            &services.database,
            authorization(&headers),
            query.as_deref().unwrap_or(""),
            None,
        )
        .await,
    )
}

async fn copy<I: VerifyIdentity, D: ReadCollection>(
    State(services): State<Arc<Services<I, D>>>,
    Path(id): Path<String>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
) -> Response {
    response(
        collection_response(
            &services.identity,
            &services.database,
            authorization(&headers),
            query.as_deref().unwrap_or(""),
            Some(&id),
        )
        .await,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use mtgscan_application::VerifyIdentity;
    use mtgscan_application::collection::{CollectionRefusal, OwnedCopy, ReadCollection};
    use mtgscan_domain::{Caller, Refusal};

    struct Auth;
    impl VerifyIdentity for Auth {
        async fn verify(&self, _: &str) -> Result<Caller, Refusal> {
            Ok(Caller::user("verified-owner".into()))
        }
    }
    struct Database;
    impl ReadCollection for Database {
        async fn read_copies(
            &self,
            _: &str,
            _: Option<&str>,
        ) -> Result<Vec<OwnedCopy>, CollectionRefusal> {
            Ok(vec![])
        }
    }

    struct CopyDatabase;
    impl ReadCollection for CopyDatabase {
        async fn read_copies(
            &self,
            _: &str,
            _: Option<&str>,
        ) -> Result<Vec<OwnedCopy>, CollectionRefusal> {
            use mtgscan_domain::collection::{CardPrinting, Copy, Face, Price, UserTag};
            Ok(vec![OwnedCopy {
                owner_id: "verified-owner".into(),
                copy: Copy {
                    copy_id: "10000000-0000-4000-8000-000000000001".into(),
                    printing: CardPrinting {
                        printing_id: "20000000-0000-4000-8000-000000000001".into(),
                        name: "Sol Ring".into(),
                        set_code: "c21".into(),
                        set_name: "Commander 2021".into(),
                        collector_number: "263".into(),
                        rarity: "uncommon".into(),
                        image_uris: vec!["https://example.test/card.jpg".into()],
                        art_crop_uri: Some("https://example.test/art.jpg".into()),
                        artist: Some("Mark Tedin".into()),
                        type_line: "Artifact".into(),
                        mana_cost: "{1}".into(),
                        commander_legality: "legal".into(),
                        faces: vec![Face {
                            name: "Sol Ring".into(),
                            oracle_text: "{T}: Add {C}{C}.".into(),
                        }],
                    },
                    finish: "foil".into(),
                    condition: "lightly_played".into(),
                    language: "en".into(),
                    protected: true,
                    added_at: "2026-10-30T10:00:00Z".into(),
                    current_price: Some(Price {
                        usd_cents: 150,
                        stale: false,
                    }),
                    purchase_day_usd_cents: Some(100),
                    user_tags: vec![UserTag {
                        user_tag_id: "30000000-0000-4000-8000-000000000001".into(),
                        name: "Signed".into(),
                    }],
                    deck: None,
                    held_for: None,
                },
            }])
        }
    }

    #[tokio::test]
    async fn the_copy_contract_preserves_metadata_without_database_owner_or_credentials() {
        let expected: Value =
            serde_json::from_str(include_str!("../fixtures/collection-copy.json")).unwrap();
        let result = collection_response(
            &Auth,
            &CopyDatabase,
            Some("Bearer token"),
            "",
            Some("10000000-0000-4000-8000-000000000001"),
        )
        .await;
        assert_eq!(result.status, 200);
        assert_eq!(result.body, expected);
        let browse =
            collection_response(&Auth, &CopyDatabase, Some("Bearer token"), "", None).await;
        assert_eq!(browse.body, serde_json::json!({"copies":[expected]}));
    }

    #[tokio::test]
    async fn the_collection_routes_are_versioned_and_never_http_cached() {
        use axum::{body::Body, http::Request};
        use tower::ServiceExt;
        let result = router(Auth, Database)
            .oneshot(
                Request::builder()
                    .uri(COLLECTION_PATH)
                    .header("Authorization", "Bearer token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(result.status(), 200);
        assert_eq!(result.headers()["cache-control"], "no-store");
        let result = router(Auth, Database)
            .oneshot(
                Request::builder()
                    .uri(COLLECTION_PATH)
                    .header("Authorization", "Bearer a")
                    .header("Authorization", "Bearer b")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(result.status(), 401);
        assert_eq!(result.headers()["www-authenticate"], "Bearer");
    }

    #[tokio::test]
    async fn a_valid_uuid_spelling_opens_the_same_stable_copy() {
        let result = collection_response(
            &Auth,
            &CopyDatabase,
            Some("Bearer token"),
            "",
            Some("10000000000040008000000000000001"),
        )
        .await;
        assert_eq!(result.status, 200);
        assert_eq!(
            result.body["copy_id"],
            "10000000-0000-4000-8000-000000000001"
        );
    }

    #[tokio::test]
    async fn malformed_copy_ids_and_owner_assertions_never_become_database_authority() {
        let result = collection_response(
            &Auth,
            &CopyDatabase,
            Some("Bearer token"),
            "",
            Some("not-a-copy-id"),
        )
        .await;
        assert_eq!(result.status, 400);
        assert_eq!(
            result.body,
            serde_json::json!({"error":{"code":"invalid_request","field":"copy_id"}})
        );
        for query in [
            "owner_id=verified-owner",
            "user_id=verified-owner",
            "owner=verified-owner&owner=another",
        ] {
            let result =
                collection_response(&Auth, &CopyDatabase, Some("Bearer token"), query, None).await;
            assert_eq!(result.status, 400);
        }
    }

    struct RefusedDatabase(CollectionRefusal);
    impl ReadCollection for RefusedDatabase {
        async fn read_copies(
            &self,
            _: &str,
            _: Option<&str>,
        ) -> Result<Vec<OwnedCopy>, CollectionRefusal> {
            Err(self.0)
        }
    }

    #[tokio::test]
    async fn refusal_contracts_do_not_turn_database_failures_into_empty_success() {
        for (refusal, status, code) in [
            (CollectionRefusal::Forbidden, 403, "forbidden"),
            (CollectionRefusal::Unavailable, 503, "unavailable"),
        ] {
            let result = collection_response(
                &Auth,
                &RefusedDatabase(refusal),
                Some("Bearer token"),
                "",
                None,
            )
            .await;
            assert_eq!(result.status, status);
            assert_eq!(
                result.body,
                serde_json::json!({"error":{"code":code,"field":null}})
            );
        }
        let missing = collection_response(
            &Auth,
            &Database,
            Some("Bearer token"),
            "",
            Some("10000000-0000-4000-8000-000000000001"),
        )
        .await;
        assert_eq!(missing.status, 404);
    }

    #[tokio::test]
    async fn collection_contracts_refuse_anonymous_and_forged_owner_parameters() {
        let anonymous = collection_response(&Auth, &Database, None, "", None).await;
        assert_eq!(anonymous.status, 401);
        assert_eq!(
            anonymous.body,
            serde_json::json!({"error":{"code":"unauthenticated","field":null}})
        );
        let forged = collection_response(
            &Auth,
            &Database,
            Some("Bearer token"),
            "owner=someone-else",
            None,
        )
        .await;
        assert_eq!(forged.status, 400);
        assert_eq!(
            forged.body,
            serde_json::json!({"error":{"code":"invalid_request","field":"query"}})
        );
    }
}
