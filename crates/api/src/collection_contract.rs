use mtgscan_domain::collection::{Copy, Deck};
use mtgscan_domain::collection_query::{CollectionQuery, QueryError, QueryValue};
use serde::Serialize;
use std::collections::BTreeMap;

pub fn query_from_value(
    fields: BTreeMap<String, serde_json::Value>,
) -> Result<CollectionQuery, QueryError> {
    use serde_json::Value;
    let fields = fields
        .into_iter()
        .map(|(field, value)| {
            let value = match value {
                Value::String(value) => QueryValue::Text(value),
                Value::Bool(value) => QueryValue::Flag(value),
                Value::Number(value) => QueryValue::Number(value.as_f64().unwrap_or(f64::NAN)),
                Value::Array(values) => QueryValue::List(
                    values
                        .into_iter()
                        .enumerate()
                        .map(|(index, value)| {
                            value.as_str().map(str::to_owned).ok_or_else(|| {
                                QueryError::invalid(
                                    &format!("{field}[{index}]"),
                                    "The value must be a string.",
                                )
                            })
                        })
                        .collect::<Result<Vec<_>, _>>()?,
                ),
                Value::Null => QueryValue::Null,
                _ => QueryValue::Invalid,
            };
            Ok((field, value))
        })
        .collect::<Result<BTreeMap<_, _>, QueryError>>()?;
    CollectionQuery::new(fields)
}

#[derive(Serialize)]
pub struct BrowseResult {
    pub copies: Vec<CopyResult>,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub search_options: Option<SearchOptionsResult>,
    pub copies: Vec<CopyResult>,
    pub basic_lands: Option<Vec<BasicLandResult>>,
    pub total_count: Option<usize>,
    pub next_cursor: Option<String>,
    pub search_id: String,
    pub rules_data_as_of: String,
    pub rules_stale: bool,
    pub prices_observed_at: Option<String>,
    pub prices_stale: bool,
}

#[derive(Serialize)]
pub struct SearchOptionsResult {
    pub decks: Vec<DeckResult>,
    pub user_tags: Vec<String>,
}

impl From<mtgscan_application::collection::SearchOptions> for SearchOptionsResult {
    fn from(options: mtgscan_application::collection::SearchOptions) -> Self {
        Self {
            decks: options.decks.into_iter().map(Into::into).collect(),
            user_tags: options.user_tags,
        }
    }
}

#[derive(Serialize)]
pub struct BasicLandResult {
    pub oracle_id: String,
    pub name: String,
    pub image_uris: Vec<String>,
}

impl From<mtgscan_application::collection::CollectionPage> for SearchResult {
    fn from(page: mtgscan_application::collection::CollectionPage) -> Self {
        Self {
            search_options: page.options.map(Into::into),
            copies: page.copies.into_iter().map(Into::into).collect(),
            basic_lands: page.basic_lands.map(|lands| {
                lands
                    .into_iter()
                    .map(|land| BasicLandResult {
                        oracle_id: land.oracle_id,
                        name: land.name,
                        image_uris: land.image_uris,
                    })
                    .collect()
            }),
            total_count: page.total_count,
            next_cursor: page.next_cursor,
            search_id: page.search_id,
            rules_data_as_of: page.metadata.rules_data_as_of,
            rules_stale: page.metadata.rules_stale,
            prices_observed_at: page.metadata.prices_observed_at,
            prices_stale: page.metadata.prices_stale,
        }
    }
}

#[derive(Serialize)]
pub struct CopyResult {
    pub copy_id: String,
    pub printing: PrintingResult,
    pub finish: String,
    pub condition: String,
    pub language: String,
    pub protected: bool,
    pub added_at: String,
    pub current_price: Option<PriceResult>,
    pub purchase_day_usd_cents: Option<i32>,
    pub user_tags: Vec<UserTagResult>,
    pub deck: Option<DeckResult>,
    pub held_for: Option<DeckResult>,
}

#[derive(Serialize)]
pub struct PrintingResult {
    pub printing_id: String,
    pub name: String,
    pub set_code: String,
    pub set_name: String,
    pub collector_number: String,
    pub rarity: String,
    pub image_uris: Vec<String>,
    pub art_crop_uri: Option<String>,
    pub artist: Option<String>,
    pub type_line: String,
    pub mana_cost: String,
    pub commander_legality: String,
    pub faces: Vec<FaceResult>,
}

#[derive(Serialize)]
pub struct FaceResult {
    pub name: String,
    pub oracle_text: String,
}

#[derive(Serialize)]
pub struct PriceResult {
    pub usd_cents: i32,
    pub stale: bool,
}

#[derive(Serialize)]
pub struct UserTagResult {
    pub user_tag_id: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct DeckResult {
    pub deck_id: String,
    pub name: String,
    pub commander_art_crop_uri: Option<String>,
    pub role: Option<String>,
}

#[derive(Serialize)]
pub struct RefusedResult {
    pub error: FieldError,
}

#[derive(Serialize)]
pub struct FieldError {
    pub code: &'static str,
    pub field: Option<&'static str>,
}

impl From<Copy> for CopyResult {
    fn from(copy: Copy) -> Self {
        let printing = copy.printing;
        Self {
            copy_id: copy.copy_id,
            printing: PrintingResult {
                printing_id: printing.printing_id,
                name: printing.name,
                set_code: printing.set_code,
                set_name: printing.set_name,
                collector_number: printing.collector_number,
                rarity: printing.rarity,
                image_uris: printing.image_uris,
                art_crop_uri: printing.art_crop_uri,
                artist: printing.artist,
                type_line: printing.type_line,
                mana_cost: printing.mana_cost,
                commander_legality: printing.commander_legality,
                faces: printing
                    .faces
                    .into_iter()
                    .map(|face| FaceResult {
                        name: face.name,
                        oracle_text: face.oracle_text,
                    })
                    .collect(),
            },
            finish: copy.finish,
            condition: copy.condition,
            language: copy.language,
            protected: copy.protected,
            added_at: copy.added_at,
            current_price: copy.current_price.map(|price| PriceResult {
                usd_cents: price.usd_cents,
                stale: price.stale,
            }),
            purchase_day_usd_cents: copy.purchase_day_usd_cents,
            user_tags: copy
                .user_tags
                .into_iter()
                .map(|tag| UserTagResult {
                    user_tag_id: tag.user_tag_id,
                    name: tag.name,
                })
                .collect(),
            deck: copy.deck.map(Into::into),
            held_for: copy.held_for.map(Into::into),
        }
    }
}

impl From<Deck> for DeckResult {
    fn from(deck: Deck) -> Self {
        Self {
            deck_id: deck.deck_id,
            name: deck.name,
            commander_art_crop_uri: deck.commander_art_crop_uri,
            role: deck.role,
        }
    }
}
