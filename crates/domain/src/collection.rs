#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollectionRefusal {
    Unauthenticated,
    Forbidden,
    NotFound,
    Unavailable,
    DataUnavailable,
    InvalidRequest,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Copy {
    pub copy_id: String,
    pub printing: CardPrinting,
    pub finish: String,
    pub condition: String,
    pub language: String,
    pub protected: bool,
    pub added_at: String,
    pub current_price: Option<Price>,
    pub purchase_day_usd_cents: Option<i32>,
    pub user_tags: Vec<UserTag>,
    pub deck: Option<Deck>,
    pub held_for: Option<Deck>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CardPrinting {
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
    pub faces: Vec<Face>,
    pub commander_legality: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Face {
    pub name: String,
    pub oracle_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Price {
    pub usd_cents: i32,
    pub stale: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UserTag {
    pub user_tag_id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Deck {
    pub deck_id: String,
    pub name: String,
    pub commander_art_crop_uri: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OwnedCopy {
    pub owner_id: String,
    pub copy: Copy,
}

impl OwnedCopy {
    pub fn visible_to(self, caller: &crate::Caller) -> Option<Copy> {
        (self.owner_id == caller.collection_owner()).then_some(self.copy)
    }
}
