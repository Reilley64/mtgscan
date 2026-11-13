use crate::{
    collection::{CollectionResponse, authorization, bearer_credential, response},
    organization_contract,
};
use axum::{
    Router,
    body::Bytes,
    extract::{RawQuery, State},
    http::HeaderMap,
    response::Response,
    routing::post,
};
use mtgscan_application::{
    VerifyIdentity,
    organization::{OrganizationStore, organize},
};
use mtgscan_domain::organization::Problem;
use serde_json::json;
use std::sync::Arc;

#[cfg(test)]
mod tests;

pub const ORGANIZATION_PATH: &str = "/api/v1/collection/actions";

fn refused(problem: Problem) -> CollectionResponse {
    let status = match problem.code {
        "unauthenticated" => 401,
        "mcp_token_forbidden" => 403,
        "unavailable" => 503,
        _ => 400,
    };
    CollectionResponse {
        status,
        body: json!({"error":{"code":problem.code,"field":problem.field}}),
    }
}

pub async fn organization_response(
    identity: &impl VerifyIdentity,
    store: &impl OrganizationStore,
    authorization: Option<&str>,
    query: &str,
    body: &[u8],
) -> CollectionResponse {
    let credential = bearer_credential(authorization);
    if credential.is_none() {
        return refused(Problem::new("unauthenticated", None));
    }
    if !query.is_empty() {
        return refused(Problem::new("invalid_argument", Some("query")));
    }
    let request = match serde_json::from_slice(body) {
        Ok(value) => value,
        Err(_) => return refused(Problem::new("invalid_argument", None)),
    };
    let command = match organization_contract::parse(request) {
        Ok(command) => command,
        Err(error) => return refused(error),
    };
    let single = matches!(
        command,
        mtgscan_application::organization::Command::SetUserTag { single: true, .. }
    );
    match organize(identity, store, credential, command).await {
        Ok(reply) => CollectionResponse {
            status: 200,
            body: if single {
                serde_json::Value::Null
            } else {
                organization_contract::result(reply.outcome, reply.ai_client)
            },
        },
        Err(error) => refused(error),
    }
}

struct Services<I, D> {
    identity: I,
    store: D,
}

pub fn router<I: VerifyIdentity + 'static, D: OrganizationStore + 'static>(
    identity: I,
    store: D,
) -> Router {
    Router::new()
        .route(ORGANIZATION_PATH, post(action::<I, D>))
        .with_state(Arc::new(Services { identity, store }))
}

async fn action<I: VerifyIdentity, D: OrganizationStore>(
    State(services): State<Arc<Services<I, D>>>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
    body: Bytes,
) -> Response {
    response(
        organization_response(
            &services.identity,
            &services.store,
            authorization(&headers),
            query.as_deref().unwrap_or(""),
            &body,
        )
        .await,
    )
}
