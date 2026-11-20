use crate::{
    collection::CollectionResponse,
    collection_contract::{FieldError, RefusedResult},
    credentials::bearer,
    organization_contract,
};
use mtgscan_application::{
    VerifyIdentity,
    organization::{OrganizationStore, Problem, organize},
};
use mtgscan_domain::Refusal;

fn refused(problem: Problem) -> CollectionResponse {
    let status = match problem.code {
        "unauthenticated" => 401,
        "forbidden" | "mcp_token_forbidden" => 403,
        "unavailable" => 503,
        _ => 400,
    };
    CollectionResponse {
        status,
        body: serde_json::to_value(RefusedResult {
            error: FieldError {
                code: problem.code,
                field: problem.field,
            },
        })
        .unwrap(),
    }
}

pub async fn organization_response(
    identity: &impl VerifyIdentity,
    store: &impl OrganizationStore,
    authorization: Option<&str>,
    query: &str,
    body: &[u8],
) -> CollectionResponse {
    let Some(credential) = bearer(authorization) else {
        return refused(Refusal::Unauthenticated.into());
    };
    let caller = match identity.verify(credential).await {
        Ok(caller) => caller,
        Err(error) => return refused(error.into()),
    };
    if let Err(error) = caller.require_user_actor() {
        return refused(error.into());
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
    match organize(store, &caller, command).await {
        Ok(outcome) => CollectionResponse {
            status: 200,
            body: organization_contract::result(outcome),
        },
        Err(error) => refused(error),
    }
}

#[cfg(test)]
mod tests;
