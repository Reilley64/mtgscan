use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum QueryValue {
    Text(String),
    List(Vec<String>),
    Number(f64),
    Flag(bool),
    Null,
    Invalid,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueryError {
    pub code: &'static str,
    pub field: String,
    pub message: String,
}

impl QueryError {
    pub fn invalid(field: &str, message: impl Into<String>) -> Self {
        Self {
            code: "invalid_argument",
            field: field.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct CollectionQuery {
    fields: BTreeMap<String, QueryValue>,
}

impl CollectionQuery {
    pub fn new(fields: BTreeMap<String, QueryValue>) -> Result<Self, QueryError> {
        let mut query = Self { fields };
        for (field, value) in &query.fields {
            let base = field.strip_suffix("_exclude").unwrap_or(field);
            let choices: Option<&[&str]> = match base {
                "colors" => Some(&["W", "U", "B", "R", "G", "C"]),
                "identity_subset_of" if field == base => Some(&["W", "U", "B", "R", "G"]),
                "rarities" => Some(&["common", "uncommon", "rare", "mythic", "special", "bonus"]),
                "finishes" => Some(&["nonfoil", "foil", "etched"]),
                "conditions" => Some(&[
                    "near_mint",
                    "lightly_played",
                    "moderately_played",
                    "heavily_played",
                    "damaged",
                ]),
                "languages" => Some(&[
                    "en", "ja", "de", "fr", "it", "es", "pt", "ko", "ru", "zhs", "zht",
                ]),
                _ => None,
            };
            let text_list = matches!(
                base,
                "names" | "types" | "keywords" | "sets" | "tags" | "deck_ids" | "user_tags"
            );
            if let QueryValue::List(values) = value {
                if text_list && !(1..=10).contains(&values.len()) {
                    return Err(QueryError::invalid(field, format!("{field} is not valid.")));
                }
                let lowered = folds_list_case(base);
                for (index, item) in values.iter().enumerate() {
                    let duplicate = values[..index].iter().any(|earlier| {
                        if lowered {
                            earlier.to_lowercase() == item.to_lowercase()
                        } else {
                            earlier == item
                        }
                    });
                    let malformed_text = text_list
                        && (!item.chars().any(char::is_alphanumeric) || item.chars().count() > 100);
                    if duplicate
                        || malformed_text
                        || choices.is_some_and(|choices| !choices.contains(&item.as_str()))
                    {
                        return Err(QueryError::invalid(
                            &format!("{field}[{index}]"),
                            format!("{field}[{index}] is not valid."),
                        ));
                    }
                }
            }
            let valid = if let Some(choices) = choices {
                matches!(value, QueryValue::List(values) if (base == "identity_subset_of" || !values.is_empty()) && values.len() <= choices.len())
            } else {
                match (field.as_str(), value) {
                    ("text", QueryValue::Text(text)) => {
                        text.chars().any(char::is_alphanumeric) && text.chars().count() <= 200
                    }
                    ("cursor", QueryValue::Text(_) | QueryValue::Null) => true,
                    ("sort", QueryValue::Text(sort)) => [
                        "relevance",
                        "added",
                        "name",
                        "mana_value",
                        "edhrec_rank",
                        "price",
                        "release_date",
                    ]
                    .contains(&sort.as_str()),
                    ("sort_order", QueryValue::Text(order)) => {
                        ["asc", "desc"].contains(&order.as_str())
                    }
                    ("limit", QueryValue::Number(n)) => {
                        n.fract() == 0.0 && (1.0..=120.0).contains(n)
                    }
                    ("mana_value_min" | "mana_value_max", QueryValue::Number(n)) => {
                        n.fract() == 0.0 && (0.0..=20.0).contains(n)
                    }
                    (
                        "power_min" | "power_max" | "toughness_min" | "toughness_max",
                        QueryValue::Number(n),
                    ) => (-99.0..=99.0).contains(n),
                    ("price_min" | "price_max", QueryValue::Text(n)) => price_cents(n).is_some(),
                    (
                        "is_commander"
                        | "is_game_changer"
                        | "is_free"
                        | "is_protected"
                        | "is_allocated"
                        | "include_oracle_text",
                        QueryValue::Flag(_),
                    ) => true,
                    (_, QueryValue::List(_)) if text_list => true,
                    _ => false,
                }
            };
            if !valid {
                return Err(QueryError::invalid(field, format!("{field} is not valid.")));
            }
        }
        for bound in ["mana_value", "power", "toughness", "price"] {
            let min = format!("{bound}_min");
            let max = format!("{bound}_max");
            if let (Some(minimum), Some(maximum)) = (query.number(&min), query.number(&max))
                && minimum > maximum
            {
                return Err(QueryError::invalid(
                    &max,
                    format!("{max} must not be less than {min}."),
                ));
            }
        }
        for (field, value) in &mut query.fields {
            let base = field.strip_suffix("_exclude").unwrap_or(field);
            if folds_list_case(base)
                && let QueryValue::List(values) = value
            {
                for value in values {
                    *value = value.to_lowercase();
                }
            }
        }
        Ok(query)
    }

    pub fn fields(&self) -> &BTreeMap<String, QueryValue> {
        &self.fields
    }

    fn number(&self, field: &str) -> Option<f64> {
        match self.fields.get(field) {
            Some(QueryValue::Number(value)) => Some(*value),
            Some(QueryValue::Text(value)) if field.starts_with("price_") => {
                price_cents(value).map(|c| c as f64)
            }
            _ => None,
        }
    }
}

fn folds_list_case(field: &str) -> bool {
    matches!(
        field,
        "keywords" | "sets" | "tags" | "user_tags" | "deck_ids"
    )
}

fn price_cents(value: &str) -> Option<i64> {
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    if whole.is_empty()
        || whole.len() > 10
        || (value.contains('.') && fraction.is_empty())
        || fraction.len() > 2
        || !whole
            .chars()
            .chain(fraction.chars())
            .all(|c| c.is_ascii_digit())
    {
        return None;
    }
    let cents = whole.parse::<i64>().ok()? * 100;
    Some(
        cents
            + match fraction.len() {
                0 => 0,
                1 => fraction.parse::<i64>().ok()? * 10,
                _ => fraction.parse::<i64>().ok()?,
            },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combined_chips_normalize_lookup_values_without_changing_exact_names() {
        let query = CollectionQuery::new(BTreeMap::from([
            ("names".into(), QueryValue::List(vec!["Éowyn".into()])),
            ("sets_exclude".into(), QueryValue::List(vec!["LEA".into()])),
            (
                "user_tags".into(),
                QueryValue::List(vec!["Étiquette".into()]),
            ),
            ("is_protected".into(), QueryValue::Flag(false)),
        ]))
        .unwrap();

        assert_eq!(
            query.fields(),
            &BTreeMap::from([
                ("names".into(), QueryValue::List(vec!["Éowyn".into()])),
                ("sets_exclude".into(), QueryValue::List(vec!["lea".into()])),
                (
                    "user_tags".into(),
                    QueryValue::List(vec!["étiquette".into()])
                ),
                ("is_protected".into(), QueryValue::Flag(false)),
            ])
        );
    }

    #[test]
    fn malformed_text_list_entries_name_the_exact_chip() {
        for (field, invalid) in [("names", "!".into()), ("types_exclude", "x".repeat(101))] {
            let error = CollectionQuery::new(BTreeMap::from([(
                field.into(),
                QueryValue::List(vec!["Sol Ring".into(), invalid]),
            )]))
            .unwrap_err();
            assert_eq!(error.field, format!("{field}[1]"));
        }
    }

    #[test]
    fn invalid_list_entries_and_numeric_bounds_keep_the_canonical_field_path() {
        for (field, value, expected) in [
            (
                "languages",
                QueryValue::List(vec!["en".into(), "he".into()]),
                "languages[1]",
            ),
            (
                "sets",
                QueryValue::List(vec!["LEA".into(), "lea".into()]),
                "sets[1]",
            ),
            ("price_min", QueryValue::Text("1.".into()), "price_min"),
            ("text", QueryValue::Text("!".into()), "text"),
            ("owner_id", QueryValue::Text("other".into()), "owner_id"),
        ] {
            assert_eq!(
                CollectionQuery::new(BTreeMap::from([(field.into(), value)]))
                    .unwrap_err()
                    .field,
                expected
            );
        }
        let error = CollectionQuery::new(BTreeMap::from([
            ("mana_value_min".into(), QueryValue::Number(4.0)),
            ("mana_value_max".into(), QueryValue::Number(2.0)),
        ]))
        .unwrap_err();
        assert_eq!(error.field, "mana_value_max");
    }
}
