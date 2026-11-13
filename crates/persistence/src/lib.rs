mod collection_cursor;
mod collection_search;

use mtgscan_application::collection::{PageCursor, ReadCollection, SearchSnapshot};
use mtgscan_domain::collection::{
    CardPrinting, CollectionRefusal, Copy, Deck, Face, OwnedCopy, Price, UserTag,
};
use mtgscan_domain::collection_query::{CollectionQuery, QueryError};
use serde::Deserialize;
use sqlx::{
    PgPool, Row,
    postgres::{PgPoolOptions, PgRow},
    types::Json,
};
use std::time::Duration;

pub struct PostgresCollection {
    pool: PgPool,
}

impl PostgresCollection {
    pub async fn connect(url: &str) -> Result<Self, &'static str> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(10))
            .connect(url)
            .await
            .map_err(|_| "Could not connect collection persistence")?;
        let allowed: bool = sqlx::query_scalar(
            "select current_user = 'mtgscan_collection_reader' and session_user = current_user
             and not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolinherit)
             and not exists (select 1 from pg_catalog.pg_auth_members where member = role.oid)
             from pg_catalog.pg_roles role where rolname = current_user",
        )
        .fetch_one(&pool)
        .await
        .map_err(|_| "Could not verify collection database role")?;
        if !allowed {
            return Err("Collection persistence requires its dedicated read-only role");
        }
        Ok(Self { pool })
    }
}

impl ReadCollection for PostgresCollection {
    async fn read_search_options(
        &self,
        owner: &str,
    ) -> Result<mtgscan_application::collection::SearchOptions, CollectionRefusal> {
        self.search_options(owner).await
    }

    fn read_cursor(
        &self,
        owner: &str,
        query: &CollectionQuery,
        token: &str,
    ) -> Result<PageCursor, QueryError> {
        collection_cursor::decode(owner, query, token)
    }
    fn write_cursor(
        &self,
        owner: &str,
        query: &CollectionQuery,
        cursor: &PageCursor,
    ) -> Result<String, QueryError> {
        collection_cursor::encode(owner, query, cursor)
    }
    async fn read_search(
        &self,
        owner: &str,
        query: &CollectionQuery,
    ) -> Result<SearchSnapshot, CollectionRefusal> {
        self.search_snapshot(owner, query).await
    }
    async fn read_copies(
        &self,
        owner: &str,
        copy_id: Option<&str>,
    ) -> Result<Vec<OwnedCopy>, CollectionRefusal> {
        read(&self.pool, owner, copy_id)
            .await
            .map_err(|_| CollectionRefusal::Unavailable)
    }
}

async fn read(
    pool: &PgPool,
    owner: &str,
    copy_id: Option<&str>,
) -> Result<Vec<OwnedCopy>, sqlx::Error> {
    let mut transaction = pool.begin().await?;
    sqlx::query("set transaction read only")
        .execute(&mut *transaction)
        .await?;
    sqlx::query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)")
        .bind(serde_json::json!({"sub":owner}).to_string())
        .bind(owner)
        .execute(&mut *transaction)
        .await?;
    let rows = sqlx::query(include_str!("copies.sql"))
        .bind(owner)
        .bind(copy_id)
        .fetch_all(&mut *transaction)
        .await?;
    let copies = rows
        .iter()
        .map(copy_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    transaction.commit().await?;
    Ok(copies)
}

#[derive(Deserialize)]
struct FaceRow {
    name: String,
    oracle_text: String,
}
#[derive(Deserialize)]
struct UserTagRow {
    user_tag_id: String,
    name: String,
}
#[derive(Deserialize)]
struct DeckRow {
    deck_id: String,
    name: String,
    commander_art_crop_uri: Option<String>,
    role: Option<String>,
}

impl From<DeckRow> for Deck {
    fn from(row: DeckRow) -> Self {
        Self {
            deck_id: row.deck_id,
            name: row.name,
            commander_art_crop_uri: row.commander_art_crop_uri,
            role: row.role,
        }
    }
}

fn copy_from_row(row: &PgRow) -> Result<OwnedCopy, sqlx::Error> {
    let Json(faces): Json<Vec<FaceRow>> = row.try_get("faces")?;
    let Json(tags): Json<Vec<UserTagRow>> = row.try_get("user_tags")?;
    let deck: Option<Json<DeckRow>> = row.try_get("deck")?;
    let held: Option<Json<DeckRow>> = row.try_get("held_for")?;
    let cents: Option<i32> = row.try_get("usd_cents")?;
    let stale = row.try_get("prices_stale")?;
    Ok(OwnedCopy {
        owner_id: row.try_get("owner_id")?,
        copy: Copy {
            copy_id: row.try_get("copy_id")?,
            printing: CardPrinting {
                printing_id: row.try_get("printing_id")?,
                name: row.try_get("name")?,
                set_code: row.try_get("set_code")?,
                set_name: row.try_get("set_name")?,
                collector_number: row.try_get("collector_number")?,
                rarity: row.try_get("rarity")?,
                image_uris: row.try_get("image_uris")?,
                art_crop_uri: row.try_get("art_crop_uri")?,
                artist: row.try_get("artist")?,
                type_line: row.try_get("type_line")?,
                mana_cost: row.try_get("mana_cost")?,
                commander_legality: row.try_get("commander_legality")?,
                faces: faces
                    .into_iter()
                    .map(|face| Face {
                        name: face.name,
                        oracle_text: face.oracle_text,
                    })
                    .collect(),
            },
            finish: row.try_get("finish")?,
            condition: row.try_get("condition")?,
            language: row.try_get("language")?,
            protected: row.try_get("is_protected")?,
            added_at: row.try_get("added_at")?,
            current_price: cents.map(|usd_cents| Price { usd_cents, stale }),
            purchase_day_usd_cents: row.try_get("purchase_day_usd_cents")?,
            user_tags: tags
                .into_iter()
                .map(|tag| UserTag {
                    user_tag_id: tag.user_tag_id,
                    name: tag.name,
                })
                .collect(),
            deck: deck.map(|value| value.0.into()),
            held_for: held.map(|value| value.0.into()),
        },
    })
}
