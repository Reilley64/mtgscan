use crate::{CatalogQuery, CatalogRefusal};
use serde_json::Value;

fn invalid(field: &str) -> CatalogRefusal {
    CatalogRefusal::invalid(Some(field.into()))
}

fn text(value: &str, max: usize, field: &str) -> Result<(), CatalogRefusal> {
    if value.chars().count() > max || !value.chars().any(char::is_alphanumeric) {
        return Err(invalid(field));
    }
    Ok(())
}

fn price(value: &str, field: &str) -> Result<u64, CatalogRefusal> {
    let (whole, fraction) = value.split_once('.').unwrap_or((value, "00"));
    if whole.is_empty()
        || whole.len() > 10
        || !whole.bytes().all(|byte| byte.is_ascii_digit())
        || fraction.is_empty()
        || fraction.len() > 2
        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(invalid(field));
    }
    let cents = fraction.parse::<u64>().map_err(|_| invalid(field))?
        * if fraction.len() == 1 { 10 } else { 1 };
    Ok(whole.parse::<u64>().map_err(|_| invalid(field))? * 100 + cents)
}

fn list(
    field: &str,
    values: &[Value],
    choices: Option<&[&str]>,
    lowercase: bool,
) -> Result<(), CatalogRefusal> {
    let minimum = usize::from(field != "identity_subset_of");
    if values.len() < minimum || values.len() > choices.map_or(10, <[&str]>::len) {
        return Err(invalid(field));
    }
    let mut seen = Vec::new();
    for (index, value) in values.iter().enumerate() {
        let path = format!("{field}[{index}]");
        let value = value.as_str().ok_or_else(|| invalid(&path))?;
        if let Some(choices) = choices {
            if !choices.contains(&value) {
                return Err(invalid(&path));
            }
        } else {
            text(value, 100, &path)?;
        }
        let key = if lowercase {
            value.to_lowercase()
        } else {
            value.to_string()
        };
        if seen.contains(&key) {
            return Err(invalid(&path));
        }
        seen.push(key);
    }
    Ok(())
}

pub fn search(query: &CatalogQuery) -> Result<(), CatalogRefusal> {
    let value = serde_json::to_value(query).map_err(|_| CatalogRefusal::invalid(None))?;
    let fields = value
        .as_object()
        .ok_or_else(|| CatalogRefusal::invalid(None))?;
    for (field, value) in fields {
        match field.as_str() {
            "text" => text(value.as_str().ok_or_else(|| invalid(field))?, 200, field)?,
            "names" | "names_exclude" | "types" | "types_exclude" | "keywords"
            | "keywords_exclude" | "sets" | "sets_exclude" | "tags" | "tags_exclude" => {
                list(
                    field,
                    value.as_array().ok_or_else(|| invalid(field))?,
                    None,
                    matches!(
                        field.as_str(),
                        "keywords"
                            | "keywords_exclude"
                            | "sets"
                            | "sets_exclude"
                            | "tags"
                            | "tags_exclude"
                    ),
                )?;
            }
            "colors" | "colors_exclude" => list(
                field,
                value.as_array().ok_or_else(|| invalid(field))?,
                Some(&["W", "U", "B", "R", "G", "C"]),
                false,
            )?,
            "identity_subset_of" => list(
                field,
                value.as_array().ok_or_else(|| invalid(field))?,
                Some(&["W", "U", "B", "R", "G"]),
                false,
            )?,
            "rarities" | "rarities_exclude" => list(
                field,
                value.as_array().ok_or_else(|| invalid(field))?,
                Some(&["common", "uncommon", "rare", "mythic", "special", "bonus"]),
                false,
            )?,
            "mana_value_min" | "mana_value_max" | "power_min" | "power_max" | "toughness_min"
            | "toughness_max" | "limit" => {
                let number = value.as_f64().ok_or_else(|| invalid(field))?;
                let (min, max, integer) = match field.as_str() {
                    "limit" => (1.0, 50.0, true),
                    "mana_value_min" | "mana_value_max" => (0.0, 20.0, true),
                    _ => (-99.0, 99.0, false),
                };
                if !(min..=max).contains(&number) || (integer && number.fract() != 0.0) {
                    return Err(invalid(field));
                }
            }
            "price_min" | "price_max" => {
                price(value.as_str().ok_or_else(|| invalid(field))?, field)?;
            }
            "sort"
                if ![
                    "relevance",
                    "name",
                    "mana_value",
                    "edhrec_rank",
                    "price",
                    "release_date",
                ]
                .contains(&value.as_str().unwrap_or("")) =>
            {
                return Err(invalid(field));
            }
            "sort_order" if !["asc", "desc"].contains(&value.as_str().unwrap_or("")) => {
                return Err(invalid(field));
            }
            _ => {}
        }
    }
    for (name, min, max) in [
        ("mana_value", query.mana_value_min, query.mana_value_max),
        ("power", query.power_min, query.power_max),
        ("toughness", query.toughness_min, query.toughness_max),
    ] {
        if let (Some(min), Some(max)) = (min, max)
            && min > max
        {
            return Err(invalid(&format!("{name}_max")));
        }
    }
    if let (Some(min), Some(max)) = (&query.price_min, &query.price_max)
        && price(min, "price_min")? > price(max, "price_max")?
    {
        return Err(invalid("price_max"));
    }
    if query.sort.as_deref() == Some("relevance") && query.text.is_none() {
        return Err(invalid("sort"));
    }
    if !fields.keys().any(|field| {
        ![
            "sort",
            "sort_order",
            "limit",
            "include_oracle_text",
            "cursor",
        ]
        .contains(&field.as_str())
    }) {
        return Err(CatalogRefusal::invalid(None));
    }
    Ok(())
}
