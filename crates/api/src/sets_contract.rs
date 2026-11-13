use mtgscan_domain::sets::*;
use serde_json::{Value, json};

fn completions(values: &FinishValues<Completion>) -> Value {
    let value = |c: &Completion| json!({"owned": c.owned, "size": c.size});
    json!({"any": value(&values.any), "nonfoil": value(&values.nonfoil), "foil": value(&values.foil)})
}

fn printings(values: &[SetCardPrinting]) -> Value {
    Value::Array(values.iter().map(|p| json!({
        "printing_id": p.printing_id, "name": p.name, "collector_number": p.collector_number,
        "image_uri": p.image_uri, "finishes": p.finishes,
        "counts": {"any": p.counts.any, "nonfoil": p.counts.nonfoil, "foil": p.counts.foil}
    })).collect())
}

fn group(value: &SetGroup) -> Value {
    json!({"name": value.name, "completion": completions(&value.completion), "card_printings": printings(&value.card_printings)})
}

pub fn set_summary(page: &SetPage) -> Value {
    json!({"code": page.set.code, "name": page.set.name, "released_at": page.set.released_at,
        "icon_svg_uri": page.set.icon_svg_uri, "set_art_uri": page.set_art_uri,
        "completion": completions(&page.completion)})
}

pub fn set_details(page: &SetPage) -> Value {
    let mut value = set_summary(page);
    value["main_set"] = printings(&page.main_set);
    value["variants"] = group(&page.variants);
    value["sections"] = Value::Array(page.sections.iter().map(group).collect());
    value["other"] = group(&page.other);
    value
}
