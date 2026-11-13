use crate::collection::{CollectionResponse, refused, response};
use crate::credentials::{authorization, bearer};
use crate::sets_contract::{set_details, set_summary};
use axum::{
    Router,
    extract::{Path, Query, State},
    http::{HeaderMap, Uri},
    response::Response,
    routing::get,
};
use mtgscan_application::{
    VerifyIdentity,
    sets::{ReadSets, SetListQuery, SetsError, browse_sets, open_set},
};
use mtgscan_domain::{collection::CollectionRefusal, sets::FinishView};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;

pub const SETS_PATH: &str = "/api/v1/sets";
pub const SET_PATH: &str = "/api/v1/sets/{code}";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ListRequest {
    finish_view: String,
    text: Option<String>,
    cursor: Option<String>,
    limit: Option<usize>,
}

fn failure(error: SetsError) -> CollectionResponse {
    match error {
        SetsError::Refused(error) => refused(error, None),
        SetsError::InvalidArgument(field) => {
            refused(CollectionRefusal::InvalidRequest, Some(field))
        }
        SetsError::InvalidCursor => CollectionResponse {
            status: 400,
            body: json!({"error":{"code":"invalid_cursor", "field":"cursor"}}),
        },
    }
}

pub async fn sets_response(
    identity: &impl VerifyIdentity,
    database: &impl ReadSets,
    authorization: Option<&str>,
    uri: &Uri,
    code: Option<&str>,
) -> CollectionResponse {
    let credential = bearer(authorization);
    if credential.is_none() {
        return refused(CollectionRefusal::Unauthenticated, None);
    }
    if let Some(code) = code {
        if uri.query().is_some_and(|query| !query.is_empty()) {
            return failure(SetsError::InvalidArgument("query"));
        }
        return match open_set(identity, database, credential, code).await {
            Ok(page) => CollectionResponse {
                status: 200,
                body: set_details(&page),
            },
            Err(error) => failure(error),
        };
    }
    let Ok(Query(request)) = Query::<ListRequest>::try_from_uri(uri) else {
        return failure(SetsError::InvalidArgument("query"));
    };
    let finish_view = match request.finish_view.as_str() {
        "any" => FinishView::Any,
        "nonfoil" => FinishView::Nonfoil,
        "foil" => FinishView::Foil,
        _ => return failure(SetsError::InvalidArgument("finish_view")),
    };
    let query = SetListQuery {
        finish_view,
        text: request.text,
        cursor: request.cursor,
        limit: request.limit.unwrap_or(20),
    };
    match browse_sets(identity, database, credential, &query).await {
        Ok(page) => CollectionResponse {
            status: 200,
            body: json!({"items": page.items.iter().map(set_summary).collect::<Vec<_>>(), "next_cursor": page.next_cursor}),
        },
        Err(error) => failure(error),
    }
}

struct Services<I, D> {
    identity: I,
    database: D,
}

pub fn router<I: VerifyIdentity + 'static, D: ReadSets + 'static>(
    identity: I,
    database: D,
) -> Router {
    Router::new()
        .route(SETS_PATH, get(list::<I, D>))
        .route(SET_PATH, get(detail::<I, D>))
        .with_state(Arc::new(Services { identity, database }))
}

async fn list<I: VerifyIdentity, D: ReadSets>(
    State(services): State<Arc<Services<I, D>>>,
    headers: HeaderMap,
    uri: Uri,
) -> Response {
    response(
        sets_response(
            &services.identity,
            &services.database,
            authorization(&headers),
            &uri,
            None,
        )
        .await,
    )
}

async fn detail<I: VerifyIdentity, D: ReadSets>(
    State(services): State<Arc<Services<I, D>>>,
    headers: HeaderMap,
    Path(code): Path<String>,
    uri: Uri,
) -> Response {
    response(
        sets_response(
            &services.identity,
            &services.database,
            authorization(&headers),
            &uri,
            Some(&code),
        )
        .await,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::Request,
    };
    use mtgscan_domain::{Caller, Refusal, collection::CollectionRefusal, sets::*};
    use tower::ServiceExt;

    struct Identity;
    impl VerifyIdentity for Identity {
        async fn verify(&self, _: &str) -> Result<Caller, Refusal> {
            Ok(Caller::user("owner".into()))
        }
    }
    struct Database;
    impl ReadSets for Database {
        async fn catalog(&self) -> Result<SetCatalog, CollectionRefusal> {
            Ok(SetCatalog {
                today: "2027-01-04".into(),
                sets: vec![CardSet {
                    code: "tst".into(),
                    name: "Test set".into(),
                    released_at: "2026-01-01".into(),
                    icon_svg_uri: "set.svg".into(),
                    sections: vec![],
                }],
            })
        }
        async fn printings(
            &self,
            _: &str,
            _: &[String],
        ) -> Result<Vec<SetPrinting>, CollectionRefusal> {
            Ok(vec![SetPrinting {
                set_code: "tst".into(),
                printing_id: "10000000-0000-4000-8000-000000000001".into(),
                name: "Card".into(),
                collector_number: "1".into(),
                image_uri: Some("card.jpg".into()),
                art_crop_uri: Some("art.jpg".into()),
                finishes: vec!["nonfoil".into()],
                booster: true,
                promo: false,
                variation: false,
                basic_land: false,
                absent: false,
                prices: [None; 3],
                copy_counts_by_finish: vec![],
                sections: vec![],
            }])
        }
    }

    #[tokio::test]
    async fn sets_queries_refuse_owner_assertions_invalid_bounds_and_stale_cursors() {
        for (query, field) in [
            ("finish_view=any&owner=other", "query"),
            ("finish_view=any&finish_view=foil", "query"),
            ("finish_view=unknown", "finish_view"),
            ("finish_view=any&limit=0", "limit"),
            ("finish_view=any&text=", "text"),
            ("finish_view=any&cursor=made-up", "cursor"),
        ] {
            let uri = format!("/api/v1/sets?{query}").parse().unwrap();
            let result =
                sets_response(&Identity, &Database, Some("Bearer token"), &uri, None).await;
            assert_eq!(result.status, 400);
            assert_eq!(result.body["error"]["field"], field);
        }
        let uri = "/api/v1/sets?finish_view=any".parse().unwrap();
        let result = sets_response(&Identity, &Database, None, &uri, None).await;
        assert_eq!(result.status, 401);
        let result = sets_response(&Identity, &Database, Some("Bearer token"), &uri, None).await;
        assert_eq!(result.body["items"][0]["code"], "tst");
        assert_eq!(result.body["next_cursor"], serde_json::Value::Null);
        let uri = "/api/v1/sets/tst?owner=other".parse().unwrap();
        let result = sets_response(
            &Identity,
            &Database,
            Some("Bearer token"),
            &uri,
            Some("tst"),
        )
        .await;
        assert_eq!(result.status, 400);
    }

    #[tokio::test]
    async fn sets_contracts_reach_the_real_use_case_and_preserve_the_checklist() {
        let result = router(Identity, Database)
            .oneshot(
                Request::builder()
                    .uri("/api/v1/sets/tst")
                    .header("Authorization", "Bearer token")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(result.status(), 200);
        assert_eq!(result.headers()["cache-control"], "no-store");
        let value: serde_json::Value =
            serde_json::from_slice(&to_bytes(result.into_body(), 100000).await.unwrap()).unwrap();
        let expected: serde_json::Value =
            serde_json::from_str(include_str!("../fixtures/set-page.json")).unwrap();
        assert_eq!(value, expected);
    }
}
