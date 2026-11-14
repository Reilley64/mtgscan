use crate::PostgresCollection;
use mtgscan_application::catalog::ReadCatalog;
use mtgscan_catalog_contract::*;
use mtgscan_domain::Caller;
use serde_json::Value;
use sqlx::{Postgres, Transaction, types::Json};

impl ReadCatalog for PostgresCollection {
    async fn query(
        &self,
        caller: &Caller,
        request: CatalogRequest,
    ) -> Result<CatalogResult, CatalogRefusal> {
        execute(self, caller, request)
            .await
            .map_err(database_refusal)
    }
}

fn database_refusal(error: sqlx::Error) -> CatalogRefusal {
    if let sqlx::Error::Database(error) = &error
        && error.code().as_deref() == Some("PGRST")
        && let Ok(value) = serde_json::from_str::<Value>(error.message())
        && let Ok(code) = serde_json::from_value::<CatalogErrorCode>(value["code"].clone())
        && matches!(
            code,
            CatalogErrorCode::InvalidArgument
                | CatalogErrorCode::InvalidCursor
                | CatalogErrorCode::DataUnavailable
                | CatalogErrorCode::NotFound
        )
    {
        return CatalogRefusal {
            code,
            field: value["details"].as_str().map(str::to_string),
        };
    }
    CatalogRefusal::unavailable()
}

async fn execute(
    database: &PostgresCollection,
    caller: &Caller,
    request: CatalogRequest,
) -> Result<CatalogResult, sqlx::Error> {
    let (operation, query) = match request {
        CatalogRequest::Search(query) => (CatalogOperation::Search, serde_json::to_value(query)),
        CatalogRequest::Cards(query) => (CatalogOperation::Cards, serde_json::to_value(query)),
        CatalogRequest::Printings(query) => {
            (CatalogOperation::Printings, serde_json::to_value(query))
        }
        CatalogRequest::Tags(query) => (CatalogOperation::Tags, serde_json::to_value(query)),
    };
    let query = query.map_err(|error| sqlx::Error::Decode(Box::new(error)))?;
    let mut transaction = database.pool.begin().await?;
    let (mode, sql) = match operation {
        CatalogOperation::Search => (
            "set transaction read write",
            "select public.search_catalog($1)",
        ),
        CatalogOperation::Cards => ("set transaction read only", "select public.get_cards($1)"),
        CatalogOperation::Printings => (
            "set transaction read only",
            "select public.list_card_printings($1)",
        ),
        CatalogOperation::Tags => (
            "set transaction read only",
            "select public.search_oracle_tags($1)",
        ),
    };
    sqlx::query(mode).execute(&mut *transaction).await?;
    let mut claims = serde_json::json!({"sub":caller.collection_owner(), "role":"authenticated"});
    if let Some(client_id) = caller.ai_client_id() {
        claims["client_id"] = Value::String(client_id.into());
    }
    sqlx::query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)")
        .bind(claims.to_string()).bind(caller.collection_owner()).execute(&mut *transaction).await?;
    let Json(mut result): Json<Value> = sqlx::query_scalar(sql)
        .bind(Json(query))
        .fetch_one(&mut *transaction)
        .await?;
    if matches!(
        operation,
        CatalogOperation::Cards | CatalogOperation::Printings
    ) {
        artwork(&mut transaction, &mut result, operation).await?;
    }
    let result = match operation {
        CatalogOperation::Search => serde_json::from_value(result).map(CatalogResult::Search),
        CatalogOperation::Cards => serde_json::from_value(result).map(CatalogResult::Cards),
        CatalogOperation::Printings => serde_json::from_value(result).map(CatalogResult::Printings),
        CatalogOperation::Tags => serde_json::from_value(result).map(CatalogResult::Tags),
    }
    .map_err(|error| sqlx::Error::Decode(Box::new(error)))?;
    transaction.commit().await?;
    Ok(result)
}

async fn artwork(
    transaction: &mut Transaction<'_, Postgres>,
    result: &mut Value,
    operation: CatalogOperation,
) -> Result<(), sqlx::Error> {
    let Some(items) = result["items"].as_array_mut() else {
        return Ok(());
    };
    let ids: Vec<String> = items
        .iter()
        .filter_map(|item| {
            let printing = if operation == CatalogOperation::Cards {
                &item["printing"]
            } else {
                item
            };
            printing["printing_id"].as_str().map(str::to_string)
        })
        .collect();
    if ids.is_empty() {
        return Ok(());
    }
    let rows: Vec<Json<Value>> = sqlx::query_scalar(
        "select jsonb_build_object('printing_id', id, 'image_uris', image_uris, 'art_crop_uri', art_crop_uri, 'artist', artist)
         from public.card_printings where id = any($1::text[]::uuid[])"
    ).bind(&ids).fetch_all(&mut **transaction).await?;
    for item in items {
        let printing = if operation == CatalogOperation::Cards {
            &mut item["printing"]
        } else {
            item
        };
        if let Some(Json(row)) = rows
            .iter()
            .find(|Json(row)| row["printing_id"] == printing["printing_id"])
            && let Some(object) = printing.as_object_mut()
        {
            for key in ["image_uris", "art_crop_uri", "artist"] {
                object.insert(key.into(), row[key].clone());
            }
        }
    }
    Ok(())
}
