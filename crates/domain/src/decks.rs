#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeckRefusal {
    Unauthenticated,
    Forbidden,
    NotFound,
    Unavailable,
    InvalidName,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckName(String);

impl DeckName {
    pub fn new(name: &str) -> Result<Self, DeckRefusal> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 64 || name.contains('\0') {
            return Err(DeckRefusal::InvalidName);
        }
        Ok(Self(name.into()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeckPriority {
    High,
    Medium,
    Low,
}

impl DeckPriority {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MetadataChange {
    Rename(DeckName),
    Priority(DeckPriority),
    Used,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckSummary {
    pub deck_id: String,
    pub name: String,
    pub priority: String,
    pub revision: i32,
    pub card_count: i64,
    pub last_used_at: String,
    pub commanders: Vec<Commander>,
    pub evaluation: Option<EvaluationSummary>,
    pub needs_you_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Commander {
    pub copy_id: String,
    pub name: String,
    pub art_crop_uri: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvaluationSummary {
    pub validity: String,
    pub validity_stale: bool,
    pub estimated_bracket: i16,
    pub bracket_stale: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeckContents {
    pub summary: DeckSummary,
    pub created_at: String,
    pub cards: Vec<DeckCard>,
    pub basic_lands: Vec<BasicLand>,
    pub evaluation: Option<StoredEvaluation>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OwnedDeckContents {
    pub owner_id: String,
    pub deck: DeckContents,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DeckCard {
    pub copy_id: String,
    pub printing_id: String,
    pub name: String,
    pub set: String,
    pub collector_number: String,
    pub rarity: String,
    pub image_uris: Vec<String>,
    pub finish: String,
    pub condition: String,
    pub language: String,
    pub protected: bool,
    pub price: Option<CurrentPrice>,
    pub role: String,
    pub commander_at: Option<String>,
    pub added_at: String,
    pub type_line: String,
    pub mana_value: f64,
    pub colors: Vec<String>,
    pub planned_out: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurrentPrice {
    pub currency: String,
    pub amount: String,
    pub finish: String,
    pub stale: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BasicLand {
    pub oracle_id: Option<String>,
    pub name: String,
    pub image_uris: Vec<String>,
    pub count: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvaluationCard {
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    pub rule: String,
    pub citation: Option<String>,
    pub message: String,
    pub hint: Option<String>,
    pub cards: Vec<EvaluationCard>,
    pub colors: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UndeterminedCheck {
    pub rule: String,
    pub reason: String,
    pub cards: Vec<EvaluationCard>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Combo {
    pub cards: Vec<EvaluationCard>,
    pub produced_features: Vec<String>,
    pub bracket_tag: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BracketSignal {
    pub kind: String,
    pub source: String,
    pub count: i32,
    pub lowest_bracket: i16,
    pub cards: Vec<EvaluationCard>,
    pub combos: Option<Vec<Combo>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredEvaluation {
    pub summary: EvaluationSummary,
    pub violations: Vec<Violation>,
    pub undetermined: Vec<UndeterminedCheck>,
    pub chosen_color: Option<String>,
    pub bracket_signals: Vec<BracketSignal>,
    pub missing_signal_count: i32,
    pub revision: i32,
    pub catalog_at: Option<String>,
    pub oracle_tags_at: Option<String>,
    pub commander_spellbook_at: Option<String>,
    pub judged_at: String,
    pub validity_rules_data_at: Option<String>,
    pub bracket_rules_data_at: Option<String>,
    pub no_oracle_tag_data: bool,
    pub no_combo_data: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnedDeckSummary {
    pub owner_id: String,
    pub deck: DeckSummary,
}
