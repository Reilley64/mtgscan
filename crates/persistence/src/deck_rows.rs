use mtgscan_domain::decks::*;
use serde::Deserialize;

#[derive(Deserialize)]
pub(super) struct DeckSummaryRow {
    deck_id: String,
    name: String,
    priority: String,
    revision: i32,
    card_count: i64,
    last_used_at: String,
    commanders: Vec<CommanderRow>,
    evaluation: Option<EvaluationSummaryRow>,
    needs_you_count: i64,
}

impl From<DeckSummaryRow> for DeckSummary {
    fn from(row: DeckSummaryRow) -> Self {
        Self {
            deck_id: row.deck_id,
            name: row.name,
            priority: row.priority,
            revision: row.revision,
            card_count: row.card_count,
            last_used_at: row.last_used_at,
            commanders: row.commanders.into_iter().map(Into::into).collect(),
            evaluation: row.evaluation.map(Into::into),
            needs_you_count: row.needs_you_count,
        }
    }
}

#[derive(Deserialize)]
pub(super) struct CommanderRow {
    copy_id: String,
    name: String,
    art_crop_uri: Option<String>,
}

impl From<CommanderRow> for Commander {
    fn from(row: CommanderRow) -> Self {
        Self {
            copy_id: row.copy_id,
            name: row.name,
            art_crop_uri: row.art_crop_uri,
        }
    }
}

#[derive(Deserialize)]
pub(super) struct EvaluationSummaryRow {
    validity: String,
    validity_stale: bool,
    estimated_bracket: i16,
    bracket_stale: bool,
}

impl From<EvaluationSummaryRow> for EvaluationSummary {
    fn from(row: EvaluationSummaryRow) -> Self {
        Self {
            validity: row.validity,
            validity_stale: row.validity_stale,
            estimated_bracket: row.estimated_bracket,
            bracket_stale: row.bracket_stale,
        }
    }
}

#[derive(Deserialize)]
pub(super) struct DeckContentsRow {
    created_at: String,
    cards: Vec<DeckCardRow>,
    basic_lands: Vec<BasicLandRow>,
    evaluation: Option<StoredEvaluationRow>,
}

impl DeckContentsRow {
    pub(super) fn into_contents(self, summary: DeckSummary) -> DeckContents {
        DeckContents {
            summary,
            created_at: self.created_at,
            cards: self.cards.into_iter().map(Into::into).collect(),
            basic_lands: self.basic_lands.into_iter().map(Into::into).collect(),
            evaluation: self.evaluation.map(Into::into),
        }
    }
}

#[derive(Deserialize)]
pub(super) struct DeckCardRow {
    copy_id: String,
    printing_id: String,
    name: String,
    set: String,
    collector_number: String,
    rarity: String,
    image_uris: Vec<String>,
    finish: String,
    condition: String,
    language: String,
    protected: bool,
    price: Option<CurrentPriceRow>,
    role: String,
    commander_at: Option<String>,
    added_at: String,
    type_line: String,
    mana_value: f64,
    colors: Vec<String>,
    planned_out: bool,
}

impl From<DeckCardRow> for DeckCard {
    fn from(row: DeckCardRow) -> Self {
        Self {
            copy_id: row.copy_id,
            printing_id: row.printing_id,
            name: row.name,
            set: row.set,
            collector_number: row.collector_number,
            rarity: row.rarity,
            image_uris: row.image_uris,
            finish: row.finish,
            condition: row.condition,
            language: row.language,
            protected: row.protected,
            price: row.price.map(Into::into),
            role: row.role,
            commander_at: row.commander_at,
            added_at: row.added_at,
            type_line: row.type_line,
            mana_value: row.mana_value,
            colors: row.colors,
            planned_out: row.planned_out,
        }
    }
}

#[derive(Deserialize)]
pub(super) struct CurrentPriceRow {
    currency: String,
    amount: String,
    finish: String,
    stale: bool,
}

impl From<CurrentPriceRow> for CurrentPrice {
    fn from(row: CurrentPriceRow) -> Self {
        Self {
            currency: row.currency,
            amount: row.amount,
            finish: row.finish,
            stale: row.stale,
        }
    }
}

#[derive(Deserialize)]
pub(super) struct BasicLandRow {
    oracle_id: Option<String>,
    name: String,
    image_uris: Vec<String>,
    count: i32,
}

impl From<BasicLandRow> for BasicLand {
    fn from(row: BasicLandRow) -> Self {
        Self {
            oracle_id: row.oracle_id,
            name: row.name,
            image_uris: row.image_uris,
            count: row.count,
        }
    }
}

#[derive(Deserialize)]
pub(super) struct ViolationRow {
    rule: String,
    citation: Option<String>,
    message: String,
    hint: Option<String>,
    cards: Vec<EvaluationCardRow>,
    colors: Option<Vec<String>>,
}

impl From<ViolationRow> for Violation {
    fn from(row: ViolationRow) -> Self {
        Self {
            rule: row.rule,
            citation: row.citation,
            message: row.message,
            hint: row.hint,
            cards: row.cards.into_iter().map(Into::into).collect(),
            colors: row.colors,
        }
    }
}

#[derive(Deserialize)]
pub(super) struct UndeterminedCheckRow {
    rule: String,
    reason: String,
    cards: Vec<EvaluationCardRow>,
}

impl From<UndeterminedCheckRow> for UndeterminedCheck {
    fn from(row: UndeterminedCheckRow) -> Self {
        Self {
            rule: row.rule,
            reason: row.reason,
            cards: row.cards.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Deserialize)]
pub(super) struct ComboRow {
    cards: Vec<EvaluationCardRow>,
    produced_features: Vec<String>,
    bracket_tag: String,
}

impl From<ComboRow> for Combo {
    fn from(row: ComboRow) -> Self {
        Self {
            cards: row.cards.into_iter().map(Into::into).collect(),
            produced_features: row.produced_features,
            bracket_tag: row.bracket_tag,
        }
    }
}

#[derive(Deserialize)]
pub(super) struct BracketSignalRow {
    kind: String,
    source: String,
    count: i32,
    lowest_bracket: i16,
    cards: Vec<EvaluationCardRow>,
    combos: Option<Vec<ComboRow>>,
}

impl From<BracketSignalRow> for BracketSignal {
    fn from(row: BracketSignalRow) -> Self {
        Self {
            kind: row.kind,
            source: row.source,
            count: row.count,
            lowest_bracket: row.lowest_bracket,
            cards: row.cards.into_iter().map(Into::into).collect(),
            combos: row
                .combos
                .map(|combos| combos.into_iter().map(Into::into).collect()),
        }
    }
}

#[derive(Deserialize)]
pub(super) struct StoredEvaluationRow {
    summary: EvaluationSummaryRow,
    violations: Vec<ViolationRow>,
    undetermined: Vec<UndeterminedCheckRow>,
    chosen_color: Option<String>,
    bracket_signals: Vec<BracketSignalRow>,
    missing_signal_count: i32,
    revision: i32,
    catalog_at: Option<String>,
    oracle_tags_at: Option<String>,
    commander_spellbook_at: Option<String>,
    judged_at: String,
    validity_rules_data_at: Option<String>,
    bracket_rules_data_at: Option<String>,
    no_oracle_tag_data: bool,
    no_combo_data: bool,
}

impl From<StoredEvaluationRow> for StoredEvaluation {
    fn from(row: StoredEvaluationRow) -> Self {
        Self {
            summary: row.summary.into(),
            violations: row.violations.into_iter().map(Into::into).collect(),
            undetermined: row.undetermined.into_iter().map(Into::into).collect(),
            chosen_color: row.chosen_color,
            bracket_signals: row.bracket_signals.into_iter().map(Into::into).collect(),
            missing_signal_count: row.missing_signal_count,
            revision: row.revision,
            catalog_at: row.catalog_at,
            oracle_tags_at: row.oracle_tags_at,
            commander_spellbook_at: row.commander_spellbook_at,
            judged_at: row.judged_at,
            validity_rules_data_at: row.validity_rules_data_at,
            bracket_rules_data_at: row.bracket_rules_data_at,
            no_oracle_tag_data: row.no_oracle_tag_data,
            no_combo_data: row.no_combo_data,
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum EvaluationCardRow {
    Copy {
        copy_id: String,
        name: String,
        image_uris: Vec<String>,
    },
    BasicLand {
        oracle_id: String,
        name: String,
        image_uris: Vec<String>,
    },
}
impl From<EvaluationCardRow> for EvaluationCard {
    fn from(row: EvaluationCardRow) -> Self {
        match row {
            EvaluationCardRow::Copy {
                copy_id,
                name,
                image_uris,
            } => Self::Copy {
                copy_id,
                name,
                image_uris,
            },
            EvaluationCardRow::BasicLand {
                oracle_id,
                name,
                image_uris,
            } => Self::BasicLand {
                oracle_id,
                name,
                image_uris,
            },
        }
    }
}
