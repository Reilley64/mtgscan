use crate::PostgresCollection;
use mtgscan_application::sets::ReadSets;
use mtgscan_domain::{collection::CollectionRefusal, sets::*};
use serde::Deserialize;
use sqlx::{Row, types::Json};

#[derive(Deserialize)]
struct SectionRow {
    position: i32,
    name: String,
}
#[derive(Deserialize)]
struct CopyRow {
    owner_id: String,
    finish: String,
    quantity: u64,
}

impl ReadSets for PostgresCollection {
    async fn catalog(&self) -> Result<SetCatalog, CollectionRefusal> {
        read_catalog(self)
            .await
            .map_err(|_| CollectionRefusal::Unavailable)
    }
    async fn printings(
        &self,
        owner: &str,
        codes: &[String],
    ) -> Result<Vec<SetPrinting>, CollectionRefusal> {
        read_printings(self, owner, codes)
            .await
            .map_err(|_| CollectionRefusal::Unavailable)
    }
}

async fn read_catalog(database: &PostgresCollection) -> Result<SetCatalog, sqlx::Error> {
    let mut transaction = database.pool.begin().await?;
    sqlx::query("set transaction read only")
        .execute(&mut *transaction)
        .await?;
    let today = sqlx::query_scalar::<_, String>("select current_date::text")
        .fetch_one(&mut *transaction)
        .await?;
    let rows = sqlx::query("select card_set.code, card_set.name, card_set.icon_svg_uri, card_set.released_at::text,
        coalesce((select jsonb_agg(jsonb_build_object('position', section.position, 'name', section.name) order by section.position)
          from public.set_sections section where section.set_code = card_set.code), '[]'::jsonb) as sections
        from public.card_sets card_set where card_set.released_at is not null").fetch_all(&mut *transaction).await?;
    let sets = rows
        .iter()
        .map(|row| {
            let Json(sections): Json<Vec<SectionRow>> = row.try_get("sections")?;
            Ok(CardSet {
                code: row.try_get("code")?,
                name: row.try_get("name")?,
                released_at: row.try_get("released_at")?,
                icon_svg_uri: row.try_get("icon_svg_uri")?,
                sections: sections
                    .into_iter()
                    .map(|s| SetSection {
                        position: s.position,
                        name: s.name,
                    })
                    .collect(),
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;
    transaction.commit().await?;
    Ok(SetCatalog { today, sets })
}

async fn read_printings(
    database: &PostgresCollection,
    owner: &str,
    codes: &[String],
) -> Result<Vec<SetPrinting>, sqlx::Error> {
    let mut transaction = database.pool.begin().await?;
    sqlx::query("set transaction read only")
        .execute(&mut *transaction)
        .await?;
    sqlx::query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)")
        .bind(serde_json::json!({"sub": owner}).to_string()).bind(owner).execute(&mut *transaction).await?;
    let rows = sqlx::query(include_str!("set_printings.sql"))
        .bind(owner)
        .bind(codes)
        .fetch_all(&mut *transaction)
        .await?;
    let printings = rows
        .iter()
        .map(|row| {
            let Json(copies): Json<Vec<CopyRow>> = row.try_get("copies")?;
            Ok(SetPrinting {
                set_code: row.try_get("set_code")?,
                printing_id: row.try_get("printing_id")?,
                name: row.try_get("name")?,
                collector_number: row.try_get("collector_number")?,
                image_uri: row.try_get("image_uri")?,
                art_crop_uri: row.try_get("art_crop_uri")?,
                finishes: row.try_get("finishes")?,
                booster: row.try_get("booster")?,
                promo: row.try_get("promo")?,
                variation: row.try_get("variation")?,
                basic_land: row.try_get("basic_land")?,
                absent: row.try_get("absent")?,
                prices: [
                    row.try_get("usd_nonfoil_cents")?,
                    row.try_get("usd_foil_cents")?,
                    row.try_get("usd_etched_cents")?,
                ],
                copies: copies
                    .into_iter()
                    .map(|c| SetCopy {
                        owner_id: c.owner_id,
                        finish: c.finish,
                        quantity: c.quantity,
                    })
                    .collect(),
                sections: row.try_get("sections")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()?;
    transaction.commit().await?;
    Ok(printings)
}
