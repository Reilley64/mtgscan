use crate::{PostgresCollection, copy_from_row};
use mtgscan_application::collection::{SearchMetadata, SearchOptions, SearchSnapshot};
use mtgscan_domain::collection::CollectionRefusal;
use mtgscan_domain::collection_query::{BasicLand, CardFacts, CollectionQuery};
use sqlx::{Row, postgres::PgRow, types::Json};
use std::collections::BTreeMap;

impl PostgresCollection {
    pub(crate) async fn search_options(
        &self,
        owner: &str,
    ) -> Result<SearchOptions, CollectionRefusal> {
        self.load_search_options(owner)
            .await
            .map_err(|_| CollectionRefusal::Unavailable)
    }

    async fn load_search_options(&self, owner: &str) -> Result<SearchOptions, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("set transaction read only")
            .execute(&mut *transaction)
            .await?;
        sqlx::query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)")
            .bind(serde_json::json!({"sub":owner}).to_string()).bind(owner).execute(&mut *transaction).await?;
        let options = load_options(&mut transaction, owner).await?;
        transaction.commit().await?;
        Ok(options)
    }

    pub(crate) async fn search_snapshot(
        &self,
        owner: &str,
        query: &CollectionQuery,
    ) -> Result<SearchSnapshot, CollectionRefusal> {
        let snapshot = self
            .load_search_snapshot(owner, query)
            .await
            .map_err(|_| CollectionRefusal::Unavailable)?;
        if snapshot.metadata.rules_data_as_of.is_empty() {
            return Err(CollectionRefusal::DataUnavailable);
        }
        Ok(snapshot)
    }

    async fn load_search_snapshot(
        &self,
        owner: &str,
        query: &CollectionQuery,
    ) -> Result<SearchSnapshot, sqlx::Error> {
        let mut transaction = self.pool.begin().await?;
        sqlx::query("set transaction isolation level repeatable read, read only")
            .execute(&mut *transaction)
            .await?;
        sqlx::query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)")
            .bind(serde_json::json!({"sub":owner}).to_string()).bind(owner).execute(&mut *transaction).await?;
        let search_id = sqlx::query_scalar("select gen_random_uuid()::text")
            .fetch_one(&mut *transaction)
            .await?;
        let freshness = sqlx::query("select
            (select snapshot_at::text from public.import_snapshots where source = 'catalog') as rules_data_as_of,
            coalesce((select succeeded_at < now() - interval '7 days' from public.import_snapshots where source = 'catalog'), true) as rules_stale,
            (select snapshot_at::text from public.import_snapshots where source = 'prices') as prices_observed_at,
            coalesce((select snapshot_at < now() - interval '24 hours' from public.import_snapshots where source = 'prices'), true) as prices_stale").fetch_one(&mut *transaction).await?;
        let metadata = SearchMetadata {
            rules_data_as_of: freshness
                .try_get::<Option<String>, _>("rules_data_as_of")?
                .unwrap_or_default(),
            rules_stale: freshness.try_get("rules_stale")?,
            prices_observed_at: freshness.try_get("prices_observed_at")?,
            prices_stale: freshness.try_get("prices_stale")?,
        };
        let text = query
            .text("text")
            .map(|text| serde_json::json!({"text":text}))
            .unwrap_or(serde_json::json!({}));
        let text_sql = sqlx::query("select * from private.text_search($1)")
            .bind(Json(text))
            .fetch_one(&mut *transaction)
            .await?;
        let condition: Option<String> = text_sql.try_get("condition")?;
        let tier: String = text_sql.try_get("tier")?;
        let rank: String = text_sql.try_get("text_rank")?;
        let sql = include_str!("search_cards.sql")
            .replace("__TEXT_MATCH__", condition.as_deref().unwrap_or("true"))
            .replace("__TEXT_TIER__", &tier)
            .replace("__TEXT_RANK__", &rank);
        let cards = sqlx::query(&sql)
            .bind(owner)
            .fetch_all(&mut *transaction)
            .await?;
        let facts = cards
            .iter()
            .map(|row| Ok((row.try_get::<String, _>("oracle_id")?, card_facts(row)?)))
            .collect::<Result<BTreeMap<_, _>, sqlx::Error>>()?;
        let rows = sqlx::query(include_str!("copies.sql"))
            .bind(owner)
            .bind(Option::<&str>::None)
            .fetch_all(&mut *transaction)
            .await?;
        let copies = rows
            .iter()
            .map(|row| {
                let id: String = row.try_get("oracle_id")?;
                let mut card = facts.get(&id).cloned().ok_or(sqlx::Error::RowNotFound)?;
                card.created_at = row.try_get("created_at")?;
                card.released_at = row.try_get("released_at")?;
                let mut owned = copy_from_row(row)?;
                if let Some(price) = &mut owned.copy.current_price {
                    price.stale = metadata.prices_stale;
                }
                Ok((owned, card))
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()?;
        let lands = sqlx::query("select kind_order, name, oracle_id::text, image_uris from private.basic_land_cards() where oracle_id is not null").fetch_all(&mut *transaction).await?;
        let basic_lands = lands
            .iter()
            .map(|row| {
                let id: String = row.try_get("oracle_id")?;
                Ok(BasicLand {
                    facts: facts.get(&id).cloned().ok_or(sqlx::Error::RowNotFound)?,
                    oracle_id: id,
                    name: row.try_get("name")?,
                    image_uris: row
                        .try_get::<Option<Vec<String>>, _>("image_uris")?
                        .unwrap_or_default(),
                    kind_order: row.try_get("kind_order")?,
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()?;
        let terms = query
            .list("names")
            .iter()
            .chain(query.list("names_exclude"))
            .cloned()
            .collect::<Vec<_>>();
        let normalized_rows = sqlx::query(
            "select term, private.name_key(term) as normalized from unnest($1::text[]) as term",
        )
        .bind(terms)
        .fetch_all(&mut *transaction)
        .await?;
        let normalized = normalized_rows
            .iter()
            .map(|row| Ok((row.try_get("term")?, row.try_get("normalized")?)))
            .collect::<Result<BTreeMap<_, _>, sqlx::Error>>()?;
        let values = sqlx::query("select 'sets' as field, set_code as value from public.card_printings group by set_code
            union select 'keywords', lower(keyword) from public.cards cross join lateral unnest(keywords) keyword
            union select 'tags', slug from public.oracle_tags tag where not exists (select 1 from public.disabled_tags d where d.tag_id = tag.id)").fetch_all(&mut *transaction).await?;
        let mut known_values: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for row in values {
            known_values
                .entry(row.try_get("field")?)
                .or_default()
                .push(row.try_get("value")?);
        }
        let options = load_options(&mut transaction, owner).await?;
        known_values.insert("user_tags".into(), options.user_tags.clone());
        known_values.insert(
            "deck_ids".into(),
            options
                .decks
                .iter()
                .map(|deck| deck.deck_id.clone())
                .collect(),
        );
        transaction.commit().await?;
        Ok(SearchSnapshot {
            search_id,
            metadata,
            options,
            copies,
            basic_lands,
            known_values,
            normalized,
        })
    }
}

async fn load_options(
    connection: &mut sqlx::PgConnection,
    owner: &str,
) -> Result<SearchOptions, sqlx::Error> {
    let decks = sqlx::query("select id::text, name from public.decks where user_id = $1::uuid order by lower(name), name, id").bind(owner).fetch_all(&mut *connection).await?.iter().map(|row| Ok(mtgscan_domain::collection::Deck { deck_id: row.try_get("id")?, name: row.try_get("name")?, commander_art_crop_uri: None, role: None })).collect::<Result<Vec<_>, sqlx::Error>>()?;
    let user_tags = sqlx::query_scalar("select name from public.user_tags where user_id = $1::uuid and deleted_at is null order by lower(name), name, id").bind(owner).fetch_all(connection).await?;
    Ok(SearchOptions { decks, user_tags })
}

fn card_facts(row: &PgRow) -> Result<CardFacts, sqlx::Error> {
    let Json(powers) = row.try_get("powers")?;
    let Json(toughnesses) = row.try_get("toughnesses")?;
    Ok(CardFacts {
        name_key: row.try_get("name_key")?,
        type_line: row.try_get("type_line")?,
        colors: row.try_get("colors")?,
        color_identity: row.try_get("color_identity")?,
        mana_value: row.try_get("mana_value")?,
        powers,
        toughnesses,
        keywords: row.try_get("keywords")?,
        tags: row.try_get("tags")?,
        can_be_commander: row.try_get("can_be_commander")?,
        is_game_changer: row.try_get("is_game_changer")?,
        edhrec_rank: row.try_get("edhrec_rank")?,
        released_at: row.try_get("released_at")?,
        created_at: 0.0,
        text_match: row.try_get("text_match")?,
        text_tier: row.try_get("text_tier")?,
        text_rank: row.try_get("text_rank")?,
    })
}
