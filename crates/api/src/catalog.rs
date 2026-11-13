use axum::{
    Json, Router,
    extract::{RawQuery, State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use mtgscan_application::{
    VerifyIdentity,
    catalog::{ReadCatalog, query_catalog},
};
use mtgscan_catalog_contract::{CatalogErrorCode, CatalogOperation, CatalogRefusal, CatalogResult};
use serde_json::Value;
use std::sync::Arc;

pub const SEARCH_PATH: &str = "/api/v1/catalog/search";

struct Services<I, D> {
    identity: I,
    database: D,
}

pub fn router<I: VerifyIdentity + 'static, D: ReadCatalog + 'static>(
    identity: I,
    database: D,
) -> Router {
    let services = Arc::new(Services { identity, database });
    let mut routes = Router::new();
    for (path, operation) in [
        (SEARCH_PATH, CatalogOperation::Search),
        ("/api/v1/catalog/cards", CatalogOperation::Cards),
        ("/api/v1/catalog/printings", CatalogOperation::Printings),
        ("/api/v1/catalog/oracle-tags", CatalogOperation::Tags),
    ] {
        routes = routes.merge(
            Router::new()
                .route(path, post(query::<I, D>))
                .with_state((services.clone(), operation)),
        );
    }
    routes
}

async fn query<I: VerifyIdentity, D: ReadCatalog>(
    State((services, operation)): State<(Arc<Services<I, D>>, CatalogOperation)>,
    headers: HeaderMap,
    RawQuery(parameters): RawQuery,
    query: Result<Json<Value>, JsonRejection>,
) -> Response {
    respond(&services, headers, parameters, query, operation).await
}

async fn respond<I: VerifyIdentity, D: ReadCatalog>(
    services: &Services<I, D>,
    headers: HeaderMap,
    parameters: Option<String>,
    query: Result<Json<Value>, JsonRejection>,
    operation: CatalogOperation,
) -> Response {
    let authorization = if headers.get_all(header::AUTHORIZATION).iter().count() == 1 {
        headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
    } else {
        None
    };
    let reply = if parameters.is_some_and(|value| !value.is_empty()) {
        refused(CatalogRefusal::invalid(Some("query".into())))
    } else {
        catalog_response(
            &services.identity,
            &services.database,
            authorization,
            operation,
            query.map(|Json(query)| query).unwrap_or(Value::Null),
        )
        .await
    };
    let mut response = (
        StatusCode::from_u16(reply.status).unwrap(),
        Json(reply.body),
    )
        .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    if reply.status == 401 {
        response
            .headers_mut()
            .insert(header::WWW_AUTHENTICATE, "Bearer".parse().unwrap());
    }
    response
}

pub struct CatalogResponse {
    pub status: u16,
    pub body: Value,
}

fn refused(error: CatalogRefusal) -> CatalogResponse {
    let status = match error.code {
        CatalogErrorCode::Unauthenticated => 401,
        CatalogErrorCode::Forbidden => 403,
        CatalogErrorCode::NotFound => 404,
        CatalogErrorCode::Unavailable | CatalogErrorCode::DataUnavailable => 503,
        CatalogErrorCode::InvalidArgument | CatalogErrorCode::InvalidCursor => 400,
    };
    CatalogResponse {
        status,
        body: serde_json::json!({"error":error}),
    }
}

pub async fn catalog_response(
    identity: &impl VerifyIdentity,
    database: &impl ReadCatalog,
    authorization: Option<&str>,
    operation: CatalogOperation,
    query: Value,
) -> CatalogResponse {
    let credential = authorization.and_then(|value| {
        let (scheme, credential) = value.split_once(' ')?;
        (scheme.eq_ignore_ascii_case("bearer")
            && !credential.is_empty()
            && !credential.chars().any(char::is_whitespace))
        .then_some(credential)
    });
    if credential.is_none() {
        return refused(CatalogRefusal {
            code: CatalogErrorCode::Unauthenticated,
            field: None,
        });
    }
    let request = match operation.parse(query) {
        Ok(request) => request,
        Err(error) => return refused(error),
    };
    match query_catalog(identity, database, credential, request).await {
        Ok(result) => CatalogResponse {
            status: 200,
            body: match result {
                CatalogResult::Search(page) => serde_json::to_value(page).unwrap(),
                CatalogResult::Cards(page) => serde_json::to_value(page).unwrap(),
                CatalogResult::Printings(page) => serde_json::to_value(page).unwrap(),
                CatalogResult::Tags(page) => serde_json::to_value(page).unwrap(),
            },
        },
        Err(error) => refused(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mtgscan_catalog_contract::CatalogRequest;
    use mtgscan_domain::{Caller, Refusal};

    struct Identity;
    impl VerifyIdentity for Identity {
        async fn verify(&self, _: &str) -> Result<Caller, Refusal> {
            Ok(Caller::user("verified-owner".into()))
        }
    }
    struct Database;
    impl ReadCatalog for Database {
        async fn query(
            &self,
            _: &Caller,
            _: CatalogRequest,
        ) -> Result<CatalogResult, CatalogRefusal> {
            Err(CatalogRefusal::unavailable())
        }
    }

    struct CatalogDatabase;
    impl ReadCatalog for CatalogDatabase {
        async fn query(
            &self,
            caller: &Caller,
            request: CatalogRequest,
        ) -> Result<CatalogResult, CatalogRefusal> {
            if caller.collection_owner() != "verified-owner" {
                return Err(CatalogRefusal::unavailable());
            }
            Ok(match request {
                CatalogRequest::Search(query) => {
                    if query.cursor.as_deref() == Some("expired") {
                        return Err(CatalogRefusal {
                            code: CatalogErrorCode::InvalidCursor,
                            field: Some("cursor".into()),
                        });
                    }
                    if query.tags.as_ref().is_some_and(|tags| tags == &["unknown"]) {
                        return Err(CatalogRefusal::invalid(Some("tags[0]".into())));
                    }
                    if query
                        .names_exclude
                        .as_ref()
                        .is_none_or(|names| names != &["Signet"])
                    {
                        return Err(CatalogRefusal::unavailable());
                    }
                    CatalogResult::Search(
                        serde_json::from_str(include_str!("../fixtures/catalog-search.json"))
                            .unwrap(),
                    )
                }
                CatalogRequest::Cards(_) => CatalogResult::Cards(
                    serde_json::from_str(include_str!("../fixtures/catalog-cards.json")).unwrap(),
                ),
                CatalogRequest::Printings(_) => CatalogResult::Printings(
                    serde_json::from_str(include_str!("../fixtures/catalog-printings.json"))
                        .unwrap(),
                ),
                CatalogRequest::Tags(_) => CatalogResult::Tags(
                    serde_json::from_str(include_str!("../fixtures/catalog-tags.json")).unwrap(),
                ),
            })
        }
    }

    #[tokio::test]
    async fn catalog_results_keep_order_quantities_rules_art_finishes_and_lookup_metadata() {
        let response = catalog_response(&Identity, &CatalogDatabase, Some("Bearer credential"), CatalogOperation::Search, serde_json::json!({"text":"ring", "names_exclude":["Signet"], "include_oracle_text":true})).await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["items"][0]["name"], "Sol Ring");
        assert_eq!(response.body["items"][1]["name"], "Ring of Three Wishes");
        assert_eq!(
            response.body["items"][0]["owned"],
            serde_json::json!({"quantity":4,"free_quantity":2,"protected_free_quantity":1})
        );
        assert_eq!(response.body["items"][1]["price_from"], Value::Null);
        assert_eq!(response.body["next_cursor"], "opaque-search-cursor");
        let response = catalog_response(
            &Identity,
            &CatalogDatabase,
            Some("Bearer credential"),
            CatalogOperation::Cards,
            serde_json::json!({"printing_ids":["20000000-0000-4000-8000-000000000001"]}),
        )
        .await;
        assert_eq!(response.status, 200);
        let card = &response.body["items"][0];
        assert_eq!(card["oracle_id"], "10000000-0000-4000-8000-000000000001");
        assert_eq!(card["faces"][0]["oracle_text"], "{T}: Add {C}{C}.");
        assert_eq!(card["printing"]["artist"], "Mark Tedin");
        assert_eq!(
            card["printing"]["art_crop_uri"],
            "https://example.test/sol-ring-art.jpg"
        );
        assert_eq!(card["tags"][0]["slug"], "mana-rock");
        assert_eq!(card["combos"][0]["other_card"]["name"], "Unwinding Clock");
        assert_eq!(
            response.body["not_found"][0],
            "10000000-0000-4000-8000-000000000099"
        );
        let response = catalog_response(&Identity, &CatalogDatabase, Some("Bearer credential"), CatalogOperation::Printings, serde_json::json!({"oracle_id":"10000000-0000-4000-8000-000000000001","owned_only":true,"cursor":"page-two"})).await;
        assert_eq!(response.status, 200);
        assert_eq!(response.body["items"][0]["set"], "c21");
        assert_eq!(response.body["items"][1]["set"], "lea");
        assert_eq!(
            response.body["items"][0]["finishes"],
            serde_json::json!(["nonfoil", "foil"])
        );
        assert_eq!(response.body["items"][0]["owned_quantity"], 3);
        assert_eq!(response.body["next_cursor"], "opaque-printing-cursor");
        let response = catalog_response(
            &Identity,
            &CatalogDatabase,
            Some("Bearer credential"),
            CatalogOperation::Tags,
            serde_json::json!({"text":"mana stone"}),
        )
        .await;
        assert_eq!(response.status, 200);
        assert_eq!(
            response.body["items"][0]["aliases"],
            serde_json::json!(["Mana stone"])
        );
        assert_eq!(
            response.body["items"][0]["parent_slugs"],
            serde_json::json!(["mana"])
        );
        assert_eq!(response.body["items"][0]["card_count"], 123);
    }

    #[tokio::test]
    async fn cursor_and_live_vocabulary_refusals_keep_their_fields_instead_of_becoming_server_errors()
     {
        for (query, code, field) in [
            (
                serde_json::json!({"text":"ring","cursor":"expired"}),
                "invalid_cursor",
                "cursor",
            ),
            (
                serde_json::json!({"tags":["unknown"]}),
                "invalid_argument",
                "tags[0]",
            ),
        ] {
            let response = catalog_response(
                &Identity,
                &CatalogDatabase,
                Some("Bearer credential"),
                CatalogOperation::Search,
                query,
            )
            .await;
            assert_eq!(response.status, 400);
            assert_eq!(
                response.body,
                serde_json::json!({"error":{"code":code,"field":field}})
            );
        }
    }

    #[tokio::test]
    async fn card_printing_and_oracle_tag_queries_share_the_versioned_catalog_boundary() {
        use axum::{
            body::{Body, to_bytes},
            http::Request,
        };
        use tower::ServiceExt;
        for (path, json) in [
            (
                "/api/v1/catalog/cards",
                r#"{"printing_ids":["20000000-0000-4000-8000-000000000001"]}"#,
            ),
            (
                "/api/v1/catalog/printings",
                r#"{"oracle_id":"10000000-0000-4000-8000-000000000001"}"#,
            ),
            ("/api/v1/catalog/oracle-tags", r#"{"text":"draw"}"#),
        ] {
            let response = router(Identity, Database)
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(path)
                        .header("Authorization", "Bearer credential")
                        .header("content-type", "application/json")
                        .body(Body::from(json))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), 503, "{path}");
            let body = to_bytes(response.into_body(), 4096).await.unwrap();
            assert_eq!(
                serde_json::from_slice::<Value>(&body).unwrap(),
                serde_json::json!({"error":{"code":"unavailable","field":null}})
            );
        }
    }

    #[tokio::test]
    async fn catalog_routes_do_not_cache_owned_quantities_or_accept_ambiguous_credentials() {
        use axum::{body::Body, http::Request};
        use tower::ServiceExt;
        let result = router(Identity, Database)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(SEARCH_PATH)
                    .header("Authorization", "Bearer credential")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"text":"ring"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(result.status(), 503);
        assert_eq!(result.headers()["cache-control"], "no-store");
        let result = router(Identity, Database)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(SEARCH_PATH)
                    .header("Authorization", "Bearer a")
                    .header("Authorization", "Bearer b")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"text":"ring"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(result.status(), 401);
        assert_eq!(result.headers()["www-authenticate"], "Bearer");
    }

    #[tokio::test]
    async fn catalog_requests_refuse_bad_fields_and_keep_nested_field_paths() {
        for (query, field) in [
            (
                serde_json::json!({"price_currency":"USD","text":"ring"}),
                "price_currency",
            ),
            (serde_json::json!({"text":null}), "text"),
            (serde_json::json!({"names":["ring",7]}), "names[1]"),
            (serde_json::json!({"finishes":["foil"]}), "finishes"),
            (serde_json::json!({"text":"ring","limit":51}), "limit"),
        ] {
            let response = catalog_response(
                &Identity,
                &Database,
                Some("Bearer credential"),
                CatalogOperation::Search,
                query,
            )
            .await;
            assert_eq!(response.status, 400);
            assert_eq!(
                response.body,
                serde_json::json!({"error":{"code":"invalid_argument","field":field}})
            );
        }
    }
}
