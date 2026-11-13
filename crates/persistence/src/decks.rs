use crate::deck_rows::{DeckContentsRow, DeckSummaryRow};
use mtgscan_application::decks::{ReadDeckContents, ReadDecks, WriteDeckMetadata};
use mtgscan_domain::decks::*;
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgPoolOptions, types::Json};
use std::time::Duration;

pub struct PostgresDecks {
    pool: PgPool,
}

impl PostgresDecks {
    pub async fn connect(url: &str) -> Result<Self, &'static str> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(Duration::from_secs(10))
            .connect(url)
            .await
            .map_err(|_| "Could not connect deck persistence")?;
        let allowed: bool = sqlx::query_scalar(
            "select current_user = 'mtgscan_decks' and session_user = current_user
             and not (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolinherit or rolreplication)
             and not exists (select 1 from pg_catalog.pg_auth_members where member = role.oid)
             from pg_catalog.pg_roles role where rolname = current_user",
        )
        .fetch_one(&pool)
        .await
        .map_err(|_| "Could not verify deck database role")?;
        if !allowed {
            return Err("Deck persistence requires its dedicated scoped role");
        }
        Ok(Self { pool })
    }

    async fn transaction(
        &self,
        owner: &str,
        read_only: bool,
    ) -> Result<Transaction<'_, Postgres>, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        if read_only {
            sqlx::query("set transaction isolation level repeatable read, read only")
                .execute(&mut *transaction)
                .await?;
        }
        sqlx::query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)")
            .bind(serde_json::json!({"sub":owner}).to_string()).bind(owner)
            .execute(&mut *transaction).await?;
        Ok(transaction)
    }
}

async fn summaries(
    transaction: &mut Transaction<'_, Postgres>,
    owner: &str,
    id: Option<&str>,
) -> Result<Vec<OwnedDeckSummary>, sqlx::Error> {
    sqlx::query(include_str!("decks.sql"))
        .bind(owner)
        .bind(id)
        .fetch_all(&mut **transaction)
        .await?
        .iter()
        .map(|row| {
            let Json(deck): Json<DeckSummaryRow> = row.try_get("summary")?;
            Ok(OwnedDeckSummary {
                owner_id: row.try_get("owner_id")?,
                deck: deck.into(),
            })
        })
        .collect()
}

impl ReadDecks for PostgresDecks {
    async fn list(&self, owner: &str) -> Result<Vec<OwnedDeckSummary>, DeckRefusal> {
        async {
            let mut transaction = self.transaction(owner, true).await?;
            let decks = summaries(&mut transaction, owner, None).await?;
            transaction.commit().await?;
            Ok::<_, sqlx::Error>(decks)
        }
        .await
        .map_err(|_| DeckRefusal::Unavailable)
    }
}

impl ReadDeckContents for PostgresDecks {
    async fn get(&self, owner: &str, id: &str) -> Result<Option<OwnedDeckContents>, DeckRefusal> {
        async {
            let mut transaction = self.transaction(owner, true).await?;
            let Some(summary) = summaries(&mut transaction, owner, Some(id)).await?.pop() else {
                return Ok(None);
            };
            let Json(contents): Json<DeckContentsRow> =
                sqlx::query_scalar(include_str!("deck_contents.sql"))
                    .bind(owner)
                    .bind(id)
                    .fetch_one(&mut *transaction)
                    .await?;
            transaction.commit().await?;
            Ok::<_, sqlx::Error>(Some(OwnedDeckContents {
                owner_id: summary.owner_id,
                deck: contents.into_contents(summary.deck),
            }))
        }
        .await
        .map_err(|_| DeckRefusal::Unavailable)
    }
}

impl WriteDeckMetadata for PostgresDecks {
    async fn metadata(
        &self,
        owner: &str,
        id: &str,
    ) -> Result<Option<OwnedDeckSummary>, DeckRefusal> {
        async {
            let mut transaction = self.transaction(owner, true).await?;
            let deck = summaries(&mut transaction, owner, Some(id)).await?.pop();
            transaction.commit().await?;
            Ok::<_, sqlx::Error>(deck)
        }
        .await
        .map_err(|_| DeckRefusal::Unavailable)
    }

    async fn create(
        &self,
        owner: &str,
        name: &DeckName,
        priority: DeckPriority,
    ) -> Result<String, DeckRefusal> {
        async {
            let mut transaction = self.transaction(owner, false).await?;
            let id = sqlx::query_scalar("insert into public.decks (user_id, name, priority) values ($1::uuid, $2, $3::public.deck_priority) returning id::text")
                .bind(owner).bind(name.as_str()).bind(priority.as_str()).fetch_one(&mut *transaction).await?;
            transaction.commit().await?;
            Ok::<_, sqlx::Error>(id)
        }.await.map_err(|_| DeckRefusal::Unavailable)
    }

    async fn edit(
        &self,
        owner: &str,
        id: &str,
        change: &MetadataChange,
    ) -> Result<(), DeckRefusal> {
        let mut transaction = self
            .transaction(owner, false)
            .await
            .map_err(|_| DeckRefusal::Unavailable)?;
        let query = match change {
            MetadataChange::Rename(name) => sqlx::query("update public.decks set name = $3, last_used_at = now() where user_id = $1::uuid and id = $2::uuid").bind(owner).bind(id).bind(name.as_str()),
            MetadataChange::Priority(priority) => sqlx::query("update public.decks set priority = $3::public.deck_priority, last_used_at = now() where user_id = $1::uuid and id = $2::uuid").bind(owner).bind(id).bind(priority.as_str()),
            MetadataChange::Used => sqlx::query("update public.decks set last_used_at = now() where user_id = $1::uuid and id = $2::uuid").bind(owner).bind(id),
        };
        let count = query
            .execute(&mut *transaction)
            .await
            .map_err(|_| DeckRefusal::Unavailable)?
            .rows_affected();
        if count == 0 {
            return Err(DeckRefusal::NotFound);
        }
        transaction
            .commit()
            .await
            .map_err(|_| DeckRefusal::Unavailable)
    }
}
