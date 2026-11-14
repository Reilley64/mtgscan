mod validation;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CatalogQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub names: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub names_exclude: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub types: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub types_exclude: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub colors: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub colors_exclude: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_subset_of: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mana_value_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mana_value_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub power_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub power_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toughness_min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toughness_max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_min: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_max: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keywords_exclude: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sets: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sets_exclude: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rarities: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rarities_exclude: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags_exclude: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_commander: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_game_changer: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_oracle_text: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_order: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogOperation {
    Search,
    Cards,
    Printings,
    Tags,
}

impl CatalogOperation {
    pub fn parse_json(self, json: &str) -> Result<CatalogRequest, CatalogRefusal> {
        self.parse(serde_json::from_str(json).map_err(|_| CatalogRefusal::invalid(None))?)
    }

    pub fn parse(self, value: serde_json::Value) -> Result<CatalogRequest, CatalogRefusal> {
        let object = value
            .as_object()
            .ok_or_else(|| CatalogRefusal::invalid(None))?;
        if let Some((field, _)) = object
            .iter()
            .find(|(field, value)| field.as_str() != "cursor" && value.is_null())
        {
            return Err(CatalogRefusal::invalid(Some(field.clone())));
        }
        match self {
            Self::Search => decode(value).map(CatalogRequest::Search),
            Self::Cards => decode(value).map(CatalogRequest::Cards),
            Self::Printings => decode(value).map(CatalogRequest::Printings),
            Self::Tags => decode(value).map(CatalogRequest::Tags),
        }
    }
}

fn decode<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> Result<T, CatalogRefusal> {
    serde_path_to_error::deserialize(value).map_err(|error| {
        let message = error.inner().to_string();
        let path = if message.starts_with("unknown field `") {
            message.split('`').nth(1).unwrap_or("").to_string()
        } else {
            error.path().to_string()
        };
        CatalogRefusal::invalid((!path.is_empty() && path != ".").then_some(path))
    })
}

#[derive(Debug, Clone, PartialEq)]
pub enum CatalogRequest {
    Search(Box<CatalogQuery>),
    Cards(CardDetailsQuery),
    Printings(CardPrintingsQuery),
    Tags(TagLookupQuery),
}

#[derive(Debug, Clone, PartialEq)]
pub enum CatalogResult {
    Search(CatalogPage),
    Cards(CardDetailsPage),
    Printings(CardPrintingsPage),
    Tags(TagLookupPage),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CatalogFreshness {
    pub rules_data_as_of: String,
    pub rules_stale: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PriceFreshness {
    pub prices_observed_at: Option<String>,
    pub prices_stale: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CatalogPage {
    pub items: Vec<CatalogRow>,
    pub next_cursor: Option<String>,
    pub search_id: String,
    #[serde(flatten)]
    pub freshness: CatalogFreshness,
    #[serde(flatten)]
    pub prices: PriceFreshness,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CatalogRow {
    pub oracle_id: String,
    pub name: String,
    pub mana_cost: String,
    pub mana_value: f64,
    pub type_line: String,
    pub color_identity: Vec<String>,
    pub is_game_changer: bool,
    pub can_be_commander: bool,
    pub edhrec_rank: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oracle_text: Option<String>,
    pub price_from: Option<PriceFrom>,
    pub owned: OwnedQuantities,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PriceFrom {
    pub currency: String,
    pub amount: String,
    pub finish: String,
    pub basis: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OwnedQuantities {
    pub quantity: i64,
    pub free_quantity: i64,
    pub protected_free_quantity: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogErrorCode {
    Unauthenticated,
    Forbidden,
    Unavailable,
    InvalidArgument,
    InvalidCursor,
    DataUnavailable,
    NotFound,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogRefusal {
    pub code: CatalogErrorCode,
    pub field: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CardDetailsQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oracle_ids: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub printing_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CardPrintingsQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oracle_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owned_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CardDetailsPage {
    pub items: Vec<CardDetails>,
    pub not_found: Vec<String>,
    #[serde(flatten)]
    pub freshness: CatalogFreshness,
    #[serde(flatten)]
    pub prices: PriceFreshness,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CardDetails {
    pub oracle_id: String,
    pub name: String,
    pub mana_cost: String,
    pub mana_value: f64,
    pub type_line: String,
    pub oracle_text: String,
    pub colors: Vec<String>,
    pub color_identity: Vec<String>,
    pub keywords: Vec<String>,
    pub faces: Vec<CardFace>,
    pub commander_legality: String,
    pub can_be_commander: bool,
    pub is_game_changer: Option<bool>,
    pub edhrec_rank: Option<i64>,
    pub released_at: String,
    pub printing_count: i64,
    pub price_from: Option<PriceFrom>,
    pub owned: OwnedQuantities,
    pub tags: Vec<OracleTagLabel>,
    pub combos: Vec<Combo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub printing: Option<CardPrinting>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CardFace {
    pub name: String,
    pub mana_cost: String,
    pub type_line: String,
    pub oracle_text: String,
    pub colors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub power: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub toughness: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loyalty: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OracleTagLabel {
    pub slug: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Combo {
    pub spellbook_id: String,
    pub other_card: OtherCard,
    pub produced_features: Vec<String>,
    pub bracket_tag: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OtherCard {
    pub oracle_id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CardPrinting {
    pub printing_id: String,
    pub set: String,
    pub set_name: String,
    pub collector_number: String,
    pub rarity: String,
    pub finishes: Vec<String>,
    pub released_at: String,
    #[serde(default)]
    pub image_uris: Vec<String>,
    pub art_crop_uri: Option<String>,
    pub artist: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CardPrintingRow {
    #[serde(flatten)]
    pub printing: CardPrinting,
    pub owned_quantity: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CardPrintingsPage {
    pub items: Vec<CardPrintingRow>,
    pub next_cursor: Option<String>,
    #[serde(flatten)]
    pub freshness: CatalogFreshness,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TagLookupQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OracleTag {
    pub id: String,
    pub slug: String,
    pub label: String,
    pub aliases: Vec<String>,
    pub description: Option<String>,
    pub parent_slugs: Vec<String>,
    pub card_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TagLookupPage {
    pub items: Vec<OracleTag>,
    #[serde(flatten)]
    pub freshness: CatalogFreshness,
}

fn uuid(value: &str, field: String) -> Result<(), CatalogRefusal> {
    if value.len() != 36
        || !value.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
    {
        return Err(CatalogRefusal::invalid(Some(field)));
    }
    Ok(())
}

impl CatalogRequest {
    pub fn validate(&self) -> Result<(), CatalogRefusal> {
        match self {
            Self::Search(query) => validation::search(query),
            Self::Tags(query) => {
                let text = query
                    .text
                    .as_deref()
                    .ok_or_else(|| CatalogRefusal::invalid(Some("text".into())))?;
                if text.chars().count() > 100 || !text.chars().any(char::is_alphanumeric) {
                    return Err(CatalogRefusal::invalid(Some("text".into())));
                }
                if query
                    .limit
                    .is_some_and(|limit| limit.fract() != 0.0 || !(1.0..=20.0).contains(&limit))
                {
                    return Err(CatalogRefusal::invalid(Some("limit".into())));
                }
                Ok(())
            }
            Self::Cards(query) => {
                for (field, ids) in [
                    ("oracle_ids", &query.oracle_ids),
                    ("printing_ids", &query.printing_ids),
                ] {
                    if let Some(ids) = ids {
                        if ids.is_empty() || ids.len() > 20 {
                            return Err(CatalogRefusal::invalid(Some(field.into())));
                        }
                        for (index, id) in ids.iter().enumerate() {
                            let path = format!("{field}[{index}]");
                            uuid(id, path.clone())?;
                            if ids[..index]
                                .iter()
                                .any(|earlier| earlier.eq_ignore_ascii_case(id))
                            {
                                return Err(CatalogRefusal::invalid(Some(path)));
                            }
                        }
                    }
                }
                if query.oracle_ids.is_some() && query.printing_ids.is_some() {
                    return Err(CatalogRefusal::invalid(Some("printing_ids".into())));
                }
                if query.oracle_ids.is_none() && query.printing_ids.is_none() {
                    return Err(CatalogRefusal::invalid(Some("oracle_ids".into())));
                }
                Ok(())
            }
            Self::Printings(query) => {
                let id = query
                    .oracle_id
                    .as_deref()
                    .ok_or_else(|| CatalogRefusal::invalid(Some("oracle_id".into())))?;
                uuid(id, "oracle_id".into())?;
                if query
                    .limit
                    .is_some_and(|limit| limit.fract() != 0.0 || !(1.0..=50.0).contains(&limit))
                {
                    return Err(CatalogRefusal::invalid(Some("limit".into())));
                }
                Ok(())
            }
        }
    }
}

impl CatalogRefusal {
    pub fn invalid(field: Option<String>) -> Self {
        Self {
            code: CatalogErrorCode::InvalidArgument,
            field,
        }
    }

    pub fn unavailable() -> Self {
        Self {
            code: CatalogErrorCode::Unavailable,
            field: None,
        }
    }
}
