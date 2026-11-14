use mtgscan_domain::decks::*;
use serde_json::{Value, json};

pub fn deck_summary(value: &DeckSummary) -> Value {
    let result = json!({
        "deck_id": value.deck_id,
        "name": value.name,
        "priority": value.priority,
        "revision": value.revision,
        "card_count": value.card_count,
        "last_used_at": value.last_used_at,
        "commanders": value.commanders.iter().map(commander).collect::<Vec<_>>(),
        "evaluation": value.evaluation.as_ref().map(evaluation_summary),
        "needs_you_count": value.needs_you_count,
    });
    result
}

pub fn commander(value: &Commander) -> Value {
    let result = json!({
        "copy_id": value.copy_id,
        "name": value.name,
        "art_crop_uri": value.art_crop_uri,
    });
    result
}

pub fn evaluation_summary(value: &EvaluationSummary) -> Value {
    let result = json!({
        "validity": value.validity,
        "validity_stale": value.validity_stale,
        "estimated_bracket": value.estimated_bracket,
        "bracket_stale": value.bracket_stale,
    });
    result
}

pub fn deck_contents(value: &DeckContents) -> Value {
    let mut result = json!({
        "created_at": value.created_at,
        "cards": value.cards.iter().map(deck_card).collect::<Vec<_>>(),
        "basic_lands": value.basic_lands.iter().map(basic_land).collect::<Vec<_>>(),
    });
    let mut base = deck_summary(&value.summary);
    base.as_object_mut().unwrap().remove("needs_you_count");
    base.as_object_mut()
        .unwrap()
        .extend(result.as_object().unwrap().clone());
    result = base;
    result["evaluation"] = value
        .evaluation
        .as_ref()
        .map(stored_evaluation)
        .unwrap_or(Value::Null);
    result
}

pub fn deck_card(value: &DeckCard) -> Value {
    let result = json!({
        "copy_id": value.copy_id,
        "printing_id": value.printing_id,
        "name": value.name,
        "set": value.set,
        "collector_number": value.collector_number,
        "rarity": value.rarity,
        "image_uris": value.image_uris,
        "finish": value.finish,
        "condition": value.condition,
        "language": value.language,
        "protected": value.protected,
        "price": value.price.as_ref().map(current_price),
        "role": value.role,
        "commander_at": value.commander_at,
        "added_at": value.added_at,
        "type_line": value.type_line,
        "mana_value": value.mana_value,
        "colors": value.colors,
        "planned_out": value.planned_out,
    });
    result
}

pub fn current_price(value: &CurrentPrice) -> Value {
    let result = json!({
        "currency": value.currency,
        "amount": value.amount,
        "finish": value.finish,
        "stale": value.stale,
    });
    result
}

pub fn basic_land(value: &BasicLand) -> Value {
    let result = json!({
        "oracle_id": value.oracle_id,
        "name": value.name,
        "image_uris": value.image_uris,
        "count": value.count,
    });
    result
}

pub fn violation(value: &Violation) -> Value {
    let mut result = json!({
        "rule": value.rule,
        "citation": value.citation,
        "message": value.message,
        "hint": value.hint,
        "cards": value.cards.iter().map(evaluation_card).collect::<Vec<_>>(),
    });
    if let Some(colors) = &value.colors {
        result["colors"] = json!(colors);
    }
    result
}

pub fn undetermined_check(value: &UndeterminedCheck) -> Value {
    let result = json!({
        "rule": value.rule,
        "reason": value.reason,
        "cards": value.cards.iter().map(evaluation_card).collect::<Vec<_>>(),
    });
    result
}

pub fn combo(value: &Combo) -> Value {
    let result = json!({
        "cards": value.cards.iter().map(evaluation_card).collect::<Vec<_>>(),
        "produced_features": value.produced_features,
        "bracket_tag": value.bracket_tag,
    });
    result
}

pub fn bracket_signal(value: &BracketSignal) -> Value {
    let mut result = json!({
        "kind": value.kind,
        "source": value.source,
        "count": value.count,
        "lowest_bracket": value.lowest_bracket,
        "cards": value.cards.iter().map(evaluation_card).collect::<Vec<_>>(),
    });
    if let Some(combos) = &value.combos {
        result["combos"] = json!(combos.iter().map(combo).collect::<Vec<_>>());
    }
    result
}

pub fn stored_evaluation(value: &StoredEvaluation) -> Value {
    let mut result = json!({
        "violations": value.violations.iter().map(violation).collect::<Vec<_>>(),
        "undetermined": value.undetermined.iter().map(undetermined_check).collect::<Vec<_>>(),
        "chosen_color": value.chosen_color,
        "bracket_signals": value.bracket_signals.iter().map(bracket_signal).collect::<Vec<_>>(),
        "missing_signal_count": value.missing_signal_count,
        "revision": value.revision,
        "catalog_at": value.catalog_at,
        "oracle_tags_at": value.oracle_tags_at,
        "commander_spellbook_at": value.commander_spellbook_at,
        "judged_at": value.judged_at,
        "validity_rules_data_at": value.validity_rules_data_at,
        "bracket_rules_data_at": value.bracket_rules_data_at,
        "no_oracle_tag_data": value.no_oracle_tag_data,
        "no_combo_data": value.no_combo_data,
    });
    result.as_object_mut().unwrap().extend(
        evaluation_summary(&value.summary)
            .as_object()
            .unwrap()
            .clone(),
    );
    result
}

fn evaluation_card(value: &EvaluationCard) -> Value {
    match value {
        EvaluationCard::Copy {
            copy_id,
            name,
            image_uris,
        } => json!({"kind":"copy","copy_id":copy_id,"name":name,"image_uris":image_uris}),
        EvaluationCard::BasicLand {
            oracle_id,
            name,
            image_uris,
        } => json!({"kind":"basic_land","oracle_id":oracle_id,"name":name,"image_uris":image_uris}),
    }
}
