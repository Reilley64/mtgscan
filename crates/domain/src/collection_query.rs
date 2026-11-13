use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct CardFacts {
    pub name_key: String,
    pub type_line: String,
    pub colors: Vec<String>,
    pub color_identity: Vec<String>,
    pub mana_value: f64,
    pub powers: Vec<Option<f64>>,
    pub toughnesses: Vec<Option<f64>>,
    pub keywords: Vec<String>,
    pub tags: Vec<String>,
    pub can_be_commander: bool,
    pub is_game_changer: bool,
    pub edhrec_rank: Option<f64>,
    pub released_at: f64,
    pub created_at: f64,
    pub text_match: bool,
    pub text_tier: f64,
    pub text_rank: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BasicLand {
    pub oracle_id: String,
    pub name: String,
    pub image_uris: Vec<String>,
    pub kind_order: i32,
    pub facts: CardFacts,
}

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

pub fn validate_cursor_scope(
    owner: &str,
    expected_owner: &str,
    identity: &CollectionQuery,
    expected_query: &CollectionQuery,
    issued_at: u64,
    now: u64,
) -> Result<(), QueryError> {
    if owner != expected_owner
        || identity.identity() != expected_query.identity()
        || now.saturating_sub(issued_at) > 900
    {
        return Err(QueryError {
            code: "invalid_cursor",
            field: "cursor".into(),
            message: "The cursor is not valid. Start the search again.".into(),
        });
    }
    Ok(())
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct CollectionQuery {
    fields: BTreeMap<String, QueryValue>,
}

#[derive(Debug, Clone, PartialEq, PartialOrd)]
pub struct SortKey {
    pub missing: bool,
    pub primary: f64,
    pub secondary: f64,
    pub name: String,
    pub printing_id: String,
    pub copy_id: String,
}

impl CollectionQuery {
    pub fn sort(&self) -> &str {
        self.text("sort").unwrap_or("relevance")
    }
    pub fn descending(&self) -> bool {
        self.text("sort_order")
            .map(|s| s == "desc")
            .unwrap_or(["relevance", "added"].contains(&self.sort()))
    }
    pub fn limit(&self) -> usize {
        self.number("limit").unwrap_or(60.0) as usize
    }
    pub fn compare_keys(&self, a: &SortKey, b: &SortKey) -> std::cmp::Ordering {
        let order = a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal);
        if (self.sort() == "name" && self.descending())
            || (self.sort() == "relevance" && self.text("text").is_some() && !self.descending())
        {
            order.reverse()
        } else {
            order
        }
    }
    pub fn sort_key(&self, copy: &crate::collection::Copy, facts: &CardFacts) -> SortKey {
        let sign = if self.descending() { -1.0 } else { 1.0 };
        let sort = if self.sort() == "relevance" && self.text("text").is_none() {
            "added"
        } else {
            self.sort()
        };
        let value = match sort {
            "price" => copy.current_price.as_ref().map(|p| p.usd_cents as f64),
            "mana_value" => Some(facts.mana_value),
            "edhrec_rank" => facts.edhrec_rank,
            "release_date" => Some(facts.released_at),
            "added" => Some(facts.created_at),
            "relevance" => Some(facts.text_tier),
            _ => Some(0.0),
        };
        SortKey {
            missing: value.is_none(),
            primary: value.unwrap_or(0.0) * if sort == "relevance" { 1.0 } else { sign },
            secondary: if sort == "relevance" {
                facts.text_rank
            } else {
                0.0
            },
            name: facts.name_key.clone(),
            printing_id: copy.printing.printing_id.clone(),
            copy_id: copy.copy_id.clone(),
        }
    }

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
            if let QueryValue::List(values) = value {
                let lowered = ["keywords", "sets", "tags", "user_tags", "deck_ids"].contains(&base);
                for (index, item) in values.iter().enumerate() {
                    let duplicate = values[..index].iter().any(|earlier| {
                        if lowered {
                            earlier.to_lowercase() == item.to_lowercase()
                        } else {
                            earlier == item
                        }
                    });
                    if duplicate || choices.is_some_and(|choices| !choices.contains(&item.as_str()))
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
                    (_, QueryValue::List(values))
                        if [
                            "names",
                            "types",
                            "keywords",
                            "sets",
                            "tags",
                            "deck_ids",
                            "user_tags",
                        ]
                        .contains(&base) =>
                    {
                        !values.is_empty()
                            && values.len() <= 10
                            && values.iter().all(|v| {
                                v.chars().any(char::is_alphanumeric) && v.chars().count() <= 100
                            })
                    }
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
            if ["sets", "keywords", "tags", "user_tags", "deck_ids"].contains(&base)
                && let QueryValue::List(values) = value
            {
                for value in values {
                    *value = value.to_lowercase();
                }
            }
        }
        Ok(query)
    }

    pub fn matches_card(&self, card: &CardFacts, normalized: &BTreeMap<String, String>) -> bool {
        if self.text("text").is_some() && !card.text_match {
            return false;
        }
        let has_name = |value: &String| {
            card.name_key
                .contains(normalized.get(value).unwrap_or(value))
        };
        if !self.list("names").iter().all(has_name)
            || self.list("names_exclude").iter().any(has_name)
        {
            return false;
        }
        let has_type = |value: &String| {
            let words = value
                .to_lowercase()
                .split(|c: char| !c.is_alphanumeric())
                .filter(|w| !w.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>();
            card.type_line.to_lowercase().split(" // ").any(|face| {
                let types = face
                    .split(|c: char| !c.is_alphanumeric())
                    .collect::<Vec<_>>();
                words.iter().all(|word| types.contains(&word.as_str()))
            })
        };
        if !self.list("types").iter().all(has_type)
            || self.list("types_exclude").iter().any(has_type)
        {
            return false;
        }
        let has_color = |color: &String| {
            if color == "C" {
                card.colors.is_empty()
            } else {
                card.colors.contains(color)
            }
        };
        if !self.list("colors").iter().all(has_color)
            || self.list("colors_exclude").iter().any(has_color)
        {
            return false;
        }
        if self.fields.contains_key("identity_subset_of")
            && !card
                .color_identity
                .iter()
                .all(|c| self.list("identity_subset_of").contains(c))
        {
            return false;
        }
        for (base, values) in [("keywords", &card.keywords), ("tags", &card.tags)] {
            if !self
                .list(base)
                .iter()
                .all(|v| values.iter().any(|a| a.eq_ignore_ascii_case(v)))
                || self
                    .list(&format!("{base}_exclude"))
                    .iter()
                    .any(|v| values.iter().any(|a| a.eq_ignore_ascii_case(v)))
            {
                return false;
            }
        }
        for (base, values) in [("power", &card.powers), ("toughness", &card.toughnesses)] {
            let min = self.number(&format!("{base}_min"));
            let max = self.number(&format!("{base}_max"));
            if (min.is_some() || max.is_some())
                && !values
                    .iter()
                    .flatten()
                    .any(|v| min.is_none_or(|min| *v >= min) && max.is_none_or(|max| *v <= max))
            {
                return false;
            }
        }
        for (field, actual) in [
            ("is_commander", card.can_be_commander),
            ("is_game_changer", card.is_game_changer),
        ] {
            if self.flag(field).is_some_and(|expected| expected != actual) {
                return false;
            }
        }
        self.number("mana_value_min")
            .is_none_or(|min| card.mana_value >= min)
            && self
                .number("mana_value_max")
                .is_none_or(|max| card.mana_value <= max)
    }

    pub fn matches_copy(&self, copy: &crate::collection::Copy) -> bool {
        for (field, value) in &self.fields {
            let base = field.strip_suffix("_exclude").unwrap_or(field);
            let excluded = base != field;
            let actual: Vec<String> = match base {
                "sets" => vec![copy.printing.set_code.clone()],
                "rarities" => vec![copy.printing.rarity.clone()],
                "finishes" => vec![copy.finish.clone()],
                "conditions" => vec![copy.condition.clone()],
                "languages" => vec![copy.language.clone()],
                "deck_ids" => copy.deck.iter().map(|deck| deck.deck_id.clone()).collect(),
                "user_tags" => copy
                    .user_tags
                    .iter()
                    .map(|tag| tag.name.to_lowercase())
                    .collect(),
                _ => continue,
            };
            if let QueryValue::List(values) = value {
                let matched =
                    |v: &String| actual.iter().any(|a| a.to_lowercase() == v.to_lowercase());
                if if excluded {
                    values.iter().any(matched)
                } else if base == "deck_ids" {
                    !values.iter().any(matched)
                } else {
                    !values.iter().all(matched)
                } {
                    return false;
                }
            }
        }
        let free = copy.deck.is_none() && copy.held_for.is_none();
        for (field, actual) in [
            ("is_free", free),
            ("is_protected", copy.protected),
            ("is_allocated", copy.deck.is_some()),
        ] {
            if self.flag(field).is_some_and(|expected| expected != actual) {
                return false;
            }
        }
        for (field, minimum) in [("price_min", true), ("price_max", false)] {
            if let Some(bound) = self.number(field)
                && !copy.current_price.as_ref().is_some_and(|price| {
                    if minimum {
                        price.usd_cents as f64 >= bound
                    } else {
                        price.usd_cents as f64 <= bound
                    }
                })
            {
                return false;
            }
        }
        true
    }

    pub fn validate_known(&self, known: &BTreeMap<String, Vec<String>>) -> Result<(), QueryError> {
        for (base, name) in [
            ("sets", "set"),
            ("keywords", "keyword"),
            ("tags", "Oracle tag"),
            ("user_tags", "user tag"),
            ("deck_ids", "deck"),
        ] {
            for field in [base.to_owned(), format!("{base}_exclude")] {
                for (index, value) in self.list(&field).iter().enumerate() {
                    if !known.get(base).is_some_and(|values| {
                        values
                            .iter()
                            .any(|v| v.to_lowercase() == value.to_lowercase())
                    }) {
                        return Err(QueryError::invalid(
                            &format!("{field}[{index}]"),
                            format!("No {name} named \"{value}\"."),
                        ));
                    }
                }
            }
        }
        Ok(())
    }

    pub fn identity(&self) -> Self {
        let mut fields = self.fields.clone();
        for field in ["cursor", "limit", "include_oracle_text"] {
            fields.remove(field);
        }
        fields.insert("sort".into(), QueryValue::Text(self.sort().into()));
        fields.insert(
            "sort_order".into(),
            QueryValue::Text(if self.descending() { "desc" } else { "asc" }.into()),
        );
        Self { fields }
    }
    pub fn fields(&self) -> &BTreeMap<String, QueryValue> {
        &self.fields
    }
    pub fn text(&self, field: &str) -> Option<&str> {
        match self.fields.get(field) {
            Some(QueryValue::Text(value)) => Some(value.trim()),
            _ => None,
        }
    }
    pub fn list(&self, field: &str) -> &[String] {
        match self.fields.get(field) {
            Some(QueryValue::List(value)) => value,
            _ => &[],
        }
    }
    pub fn number(&self, field: &str) -> Option<f64> {
        match self.fields.get(field) {
            Some(QueryValue::Number(value)) => Some(*value),
            Some(QueryValue::Text(value)) if field.starts_with("price_") => {
                price_cents(value).map(|c| c as f64)
            }
            _ => None,
        }
    }
    pub fn flag(&self, field: &str) -> Option<bool> {
        match self.fields.get(field) {
            Some(QueryValue::Flag(value)) => Some(*value),
            _ => None,
        }
    }
    pub fn searched(&self) -> bool {
        self.fields.keys().any(|field| {
            ![
                "sort",
                "sort_order",
                "limit",
                "cursor",
                "include_oracle_text",
            ]
            .contains(&field.as_str())
        })
    }
    pub fn matches_basic_lands(&self) -> bool {
        !self.fields.keys().any(|field| {
            let base = field.strip_suffix("_exclude").unwrap_or(field);
            [
                "sets",
                "rarities",
                "finishes",
                "conditions",
                "languages",
                "deck_ids",
                "user_tags",
                "price_min",
                "price_max",
                "is_free",
                "is_protected",
                "is_allocated",
            ]
            .contains(&base)
        })
    }
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
    fn basic_land_text_and_card_chips_match_together_but_not_copy_chips() {
        let query = CollectionQuery::new(BTreeMap::from([
            ("text".into(), QueryValue::Text("island".into())),
            ("types".into(), QueryValue::List(vec!["snow".into()])),
            ("colors_exclude".into(), QueryValue::List(vec!["R".into()])),
            (
                "identity_subset_of".into(),
                QueryValue::List(vec!["U".into()]),
            ),
        ]))
        .unwrap();
        let snow = CardFacts {
            type_line: "Basic Snow Land — Island".into(),
            color_identity: vec!["U".into()],
            text_match: true,
            ..Default::default()
        };
        assert!(query.matches_basic_lands());
        assert!(query.matches_card(&snow, &BTreeMap::new()));
        assert!(!query.matches_card(
            &CardFacts {
                type_line: "Basic Land — Island".into(),
                ..snow.clone()
            },
            &BTreeMap::new()
        ));
        assert!(!query.matches_card(
            &CardFacts {
                text_match: false,
                ..snow
            },
            &BTreeMap::new()
        ));
    }

    #[test]
    fn identity_colors_face_bounds_keywords_and_tags_all_constrain_a_card() {
        let query = CollectionQuery::new(BTreeMap::from([
            ("colors".into(), QueryValue::List(vec!["U".into()])),
            (
                "identity_subset_of".into(),
                QueryValue::List(vec!["U".into(), "B".into()]),
            ),
            ("power_min".into(), QueryValue::Number(2.0)),
            ("power_max".into(), QueryValue::Number(4.0)),
            ("keywords".into(), QueryValue::List(vec!["flying".into()])),
            ("tags_exclude".into(), QueryValue::List(vec!["draw".into()])),
            ("is_commander".into(), QueryValue::Flag(true)),
        ]))
        .unwrap();
        let card = CardFacts {
            colors: vec!["U".into()],
            color_identity: vec!["U".into()],
            powers: vec![None, Some(3.0)],
            keywords: vec!["flying".into()],
            can_be_commander: true,
            ..Default::default()
        };
        assert!(query.matches_card(&card, &BTreeMap::new()));
        for wrong in [
            CardFacts {
                color_identity: vec!["R".into()],
                ..card.clone()
            },
            CardFacts {
                powers: vec![Some(1.0), Some(5.0)],
                ..card.clone()
            },
            CardFacts {
                tags: vec!["draw".into()],
                ..card.clone()
            },
            CardFacts {
                can_be_commander: false,
                ..card.clone()
            },
            CardFacts {
                keywords: vec![],
                ..card.clone()
            },
            CardFacts {
                colors: vec![],
                ..card
            },
        ] {
            assert!(!query.matches_card(&wrong, &BTreeMap::new()));
        }
    }

    #[test]
    fn names_normalize_punctuation_and_accents_with_the_catalog_index() {
        let query = CollectionQuery::new(BTreeMap::from([(
            "names".into(),
            QueryValue::List(vec!["Éowyn".into()]),
        )]))
        .unwrap();
        let normalized = BTreeMap::from([("Éowyn".into(), "eowyn".into())]);
        assert!(query.matches_card(
            &CardFacts {
                name_key: "eowynshieldmaiden".into(),
                ..Default::default()
            },
            &normalized
        ));
        assert!(!query.matches_card(
            &CardFacts {
                name_key: "solring".into(),
                ..Default::default()
            },
            &normalized
        ));
    }

    #[test]
    fn an_unknown_negated_chip_is_refused_at_its_exact_field() {
        let query = CollectionQuery::new(BTreeMap::from([(
            "sets_exclude".into(),
            QueryValue::List(vec!["lea".into(), "zzz".into()]),
        )]))
        .unwrap();
        assert_eq!(
            query.validate_known(&BTreeMap::from([("sets".into(), vec!["lea".into()])])),
            Err(QueryError::invalid(
                "sets_exclude[1]",
                "No set named \"zzz\"."
            ))
        );
    }

    #[test]
    fn cursors_expire_after_fifteen_minutes_and_cannot_change_owner_or_search() {
        let query = CollectionQuery::default();
        assert!(validate_cursor_scope("a", "a", &query, &query, 100, 1000).is_ok());
        for (owner, next, now) in [
            ("a", query.clone(), 1001),
            ("b", query.clone(), 101),
            (
                "a",
                CollectionQuery::new(BTreeMap::from([(
                    "text".into(),
                    QueryValue::Text("land".into()),
                )]))
                .unwrap(),
                101,
            ),
        ] {
            let error = validate_cursor_scope("a", owner, &query, &next, 100, now).unwrap_err();
            assert_eq!(error.code, "invalid_cursor");
            assert_eq!(error.field, "cursor");
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

    #[test]
    fn exact_and_negated_copy_chips_hide_basic_lands_even_when_false() {
        let query = CollectionQuery::new(BTreeMap::from([
            ("types".into(), QueryValue::List(vec!["snow".into()])),
            ("sets_exclude".into(), QueryValue::List(vec!["lea".into()])),
            ("is_protected".into(), QueryValue::Flag(false)),
        ]))
        .unwrap();
        assert!(!query.matches_basic_lands());
    }
}
