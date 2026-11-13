use base64::{Engine, engine::general_purpose::STANDARD};
use mtgscan_application::collection::PageCursor;
use mtgscan_domain::collection_query::{
    CollectionQuery, QueryError, QueryValue, SortKey, validate_cursor_scope,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Serialize, Deserialize)]
struct Payload {
    owner: String,
    query: BTreeMap<String, Value>,
    search_id: String,
    after: (bool, f64, f64, String, String, String),
    issued_at: u64,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn invalid() -> QueryError {
    QueryError {
        code: "invalid_cursor",
        field: "cursor".into(),
        message: "The cursor is not valid. Start the search again.".into(),
    }
}

pub fn encode(
    owner: &str,
    query: &CollectionQuery,
    cursor: &PageCursor,
) -> Result<String, QueryError> {
    let key = &cursor.after;
    let fields = query
        .identity()
        .fields()
        .iter()
        .map(|(key, value)| {
            (
                key.clone(),
                match value {
                    QueryValue::Text(v) => serde_json::json!(v),
                    QueryValue::List(v) => serde_json::json!(v),
                    QueryValue::Flag(v) => serde_json::json!(v),
                    QueryValue::Number(v) => serde_json::json!(v),
                    QueryValue::Null | QueryValue::Invalid => Value::Null,
                },
            )
        })
        .collect();
    let payload = Payload {
        owner: owner.into(),
        query: fields,
        search_id: cursor.search_id.clone(),
        after: (
            key.missing,
            key.primary,
            key.secondary,
            key.name.clone(),
            key.printing_id.clone(),
            key.copy_id.clone(),
        ),
        issued_at: now(),
    };
    Ok(STANDARD.encode(serde_json::to_vec(&payload).map_err(|_| invalid())?))
}

pub fn decode(owner: &str, query: &CollectionQuery, token: &str) -> Result<PageCursor, QueryError> {
    let payload: Payload = serde_json::from_slice(&STANDARD.decode(token).map_err(|_| invalid())?)
        .map_err(|_| invalid())?;
    let fields = payload
        .query
        .into_iter()
        .map(|(field, value)| {
            let value = match value {
                Value::String(value) => QueryValue::Text(value),
                Value::Bool(value) => QueryValue::Flag(value),
                Value::Number(value) => QueryValue::Number(value.as_f64().unwrap_or(f64::NAN)),
                Value::Array(values) if values.iter().all(Value::is_string) => QueryValue::List(
                    values
                        .into_iter()
                        .map(|v| v.as_str().unwrap().to_owned())
                        .collect(),
                ),
                Value::Null => QueryValue::Null,
                _ => QueryValue::Invalid,
            };
            (field, value)
        })
        .collect();
    let identity = CollectionQuery::new(fields).map_err(|_| invalid())?;
    validate_cursor_scope(
        &payload.owner,
        owner,
        &identity,
        query,
        payload.issued_at,
        now(),
    )?;
    let (missing, primary, secondary, name, printing_id, copy_id) = payload.after;
    Ok(PageCursor {
        search_id: payload.search_id,
        after: SortKey {
            missing,
            primary,
            secondary,
            name,
            printing_id,
            copy_id,
        },
    })
}
