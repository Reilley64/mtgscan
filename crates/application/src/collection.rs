use crate::VerifyIdentity;
pub use mtgscan_domain::collection::{CollectionRefusal, Copy, OwnedCopy};
use mtgscan_domain::{Caller, Refusal};
use std::future::Future;

use mtgscan_domain::collection_query::{
    BasicLand, CardFacts, CollectionQuery, QueryError, SortKey,
};

#[derive(Debug, Clone, PartialEq)]
pub struct PageCursor {
    pub search_id: String,
    pub after: SortKey,
}
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default)]
pub struct SearchMetadata {
    pub rules_data_as_of: String,
    pub rules_stale: bool,
    pub prices_observed_at: Option<String>,
    pub prices_stale: bool,
}

#[derive(Default)]
pub struct SearchOptions {
    pub decks: Vec<mtgscan_domain::collection::Deck>,
    pub user_tags: Vec<String>,
}

#[derive(Default)]
pub struct SearchSnapshot {
    pub options: SearchOptions,
    pub search_id: String,
    pub metadata: SearchMetadata,
    pub copies: Vec<(OwnedCopy, CardFacts)>,
    pub basic_lands: Vec<BasicLand>,
    pub known_values: BTreeMap<String, Vec<String>>,
    pub normalized: BTreeMap<String, String>,
}

pub trait ReadCollection: Send + Sync {
    fn read_search_options(
        &self,
        owner: &str,
    ) -> impl Future<Output = Result<SearchOptions, CollectionRefusal>> + Send {
        async {
            Ok(self
                .read_search(owner, &CollectionQuery::default())
                .await?
                .options)
        }
    }

    fn read_cursor(
        &self,
        _owner: &str,
        _query: &CollectionQuery,
        _token: &str,
    ) -> Result<PageCursor, QueryError> {
        Err(QueryError {
            code: "invalid_cursor",
            field: "cursor".into(),
            message: "The cursor is not valid. Start the search again.".into(),
        })
    }
    fn write_cursor(
        &self,
        _owner: &str,
        _query: &CollectionQuery,
        _cursor: &PageCursor,
    ) -> Result<String, QueryError> {
        Err(QueryError {
            code: "invalid_cursor",
            field: "cursor".into(),
            message: "The cursor is not valid. Start the search again.".into(),
        })
    }

    fn read_search(
        &self,
        _owner: &str,
        _query: &CollectionQuery,
    ) -> impl Future<Output = Result<SearchSnapshot, CollectionRefusal>> + Send {
        async { Err(CollectionRefusal::Unavailable) }
    }

    fn read_copies(
        &self,
        owner: &str,
        copy_id: Option<&str>,
    ) -> impl Future<Output = Result<Vec<OwnedCopy>, CollectionRefusal>> + Send;
}

async fn caller(
    identity: &impl VerifyIdentity,
    credential: Option<&str>,
) -> Result<Caller, CollectionRefusal> {
    let credential = credential
        .filter(|value| !value.is_empty())
        .ok_or(CollectionRefusal::Unauthenticated)?;
    identity
        .verify(credential)
        .await
        .map_err(|error| match error {
            Refusal::Unauthenticated => CollectionRefusal::Unauthenticated,
            Refusal::McpTokenForbidden => CollectionRefusal::Forbidden,
            Refusal::Unavailable => CollectionRefusal::Unavailable,
        })
}

pub async fn browse_collection(
    identity: &impl VerifyIdentity,
    database: &impl ReadCollection,
    credential: Option<&str>,
) -> Result<Vec<Copy>, CollectionRefusal> {
    let caller = caller(identity, credential).await?;
    let copies = database
        .read_copies(caller.collection_owner(), None)
        .await?;
    Ok(copies
        .into_iter()
        .filter_map(|owned| owned.visible_to(&caller))
        .collect())
}

pub async fn collection_search_options(
    identity: &impl VerifyIdentity,
    database: &impl ReadCollection,
    credential: Option<&str>,
) -> Result<SearchOptions, CollectionRefusal> {
    let caller = caller(identity, credential).await?;
    database
        .read_search_options(caller.collection_owner())
        .await
}

#[derive(Debug, PartialEq)]
pub enum SearchFailure {
    Refused(CollectionRefusal),
    Query(QueryError),
}

impl From<CollectionRefusal> for SearchFailure {
    fn from(error: CollectionRefusal) -> Self {
        Self::Refused(error)
    }
}

impl From<QueryError> for SearchFailure {
    fn from(error: QueryError) -> Self {
        Self::Query(error)
    }
}

pub struct CollectionPage {
    pub options: Option<SearchOptions>,
    pub metadata: SearchMetadata,
    pub copies: Vec<Copy>,
    pub search_id: String,
    pub total_count: Option<usize>,
    pub basic_lands: Option<Vec<BasicLand>>,
    pub next_cursor: Option<String>,
}

pub async fn search_collection(
    identity: &impl VerifyIdentity,
    database: &impl ReadCollection,
    credential: Option<&str>,
    query: &mtgscan_domain::collection_query::CollectionQuery,
) -> Result<CollectionPage, SearchFailure> {
    let caller = caller(identity, credential).await?;
    let cursor = query
        .text("cursor")
        .map(|token| database.read_cursor(caller.collection_owner(), query, token))
        .transpose()?;
    let snapshot = database
        .read_search(caller.collection_owner(), query)
        .await?;
    let search_id = cursor
        .as_ref()
        .map(|cursor| cursor.search_id.clone())
        .unwrap_or(snapshot.search_id);
    query.validate_known(&snapshot.known_values)?;
    let mut matches = snapshot
        .copies
        .into_iter()
        .filter(|(_, facts)| query.matches_card(facts, &snapshot.normalized))
        .filter_map(|(owned, facts)| {
            owned
                .visible_to(&caller)
                .filter(|copy| query.matches_copy(copy))
                .map(|copy| (query.sort_key(&copy, &facts), copy))
        })
        .collect::<Vec<_>>();
    matches.sort_by(|(a, _), (b, _)| query.compare_keys(a, b));
    let total_count = cursor.is_none().then_some(matches.len());
    if let Some(cursor) = &cursor {
        matches.retain(|(key, _)| query.compare_keys(key, &cursor.after).is_gt());
    }
    let next_cursor = if matches.len() > query.limit() {
        Some(database.write_cursor(
            caller.collection_owner(),
            query,
            &PageCursor {
                search_id: search_id.clone(),
                after: matches[query.limit() - 1].0.clone(),
            },
        )?)
    } else {
        None
    };
    let copies = matches
        .into_iter()
        .take(query.limit())
        .map(|(_, copy)| copy)
        .collect::<Vec<_>>();
    let basic_lands = if query.matches_basic_lands() && (query.searched() || !copies.is_empty()) {
        let mut lands = snapshot
            .basic_lands
            .into_iter()
            .filter(|land| query.matches_card(&land.facts, &snapshot.normalized))
            .collect::<Vec<_>>();
        lands.sort_by_key(|land| land.kind_order);
        lands
    } else {
        vec![]
    };
    Ok(CollectionPage {
        options: cursor.is_none().then_some(snapshot.options),
        metadata: snapshot.metadata,
        search_id,
        total_count,
        copies,
        basic_lands: cursor.is_none().then_some(basic_lands),
        next_cursor,
    })
}

pub async fn open_copy(
    identity: &impl VerifyIdentity,
    database: &impl ReadCollection,
    credential: Option<&str>,
    copy_id: &str,
) -> Result<Copy, CollectionRefusal> {
    let caller = caller(identity, credential).await?;
    database
        .read_copies(caller.collection_owner(), Some(copy_id))
        .await?
        .into_iter()
        .filter_map(|owned| owned.visible_to(&caller))
        .find(|copy| copy.copy_id == copy_id)
        .ok_or(CollectionRefusal::NotFound)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::VerifyIdentity;
    use mtgscan_domain::{Caller, Refusal};

    struct Auth;
    impl VerifyIdentity for Auth {
        async fn verify(&self, credential: &str) -> Result<Caller, Refusal> {
            match credential {
                "invalid" => Err(Refusal::Unauthenticated),
                "outage" => Err(Refusal::Unavailable),
                "ai" => Ok(Caller::ai_client("owner-a".into(), "client".into())),
                _ => Ok(Caller::user("owner-a".into())),
            }
        }
    }

    #[tokio::test]
    async fn anonymous_and_invalid_callers_cannot_read_copies_but_ai_clients_keep_read_permission()
    {
        for credential in [None, Some(""), Some("invalid")] {
            assert_eq!(
                browse_collection(&Auth, &MixedDatabase, credential).await,
                Err(CollectionRefusal::Unauthenticated)
            );
            assert_eq!(
                open_copy(&Auth, &MixedDatabase, credential, "stable-a").await,
                Err(CollectionRefusal::Unauthenticated)
            );
        }
        assert_eq!(
            open_copy(&Auth, &MixedDatabase, Some("ai"), "stable-a")
                .await
                .unwrap()
                .copy_id,
            "stable-a"
        );
        assert_eq!(
            browse_collection(&Auth, &MixedDatabase, Some("outage")).await,
            Err(CollectionRefusal::Unavailable)
        );
    }

    #[tokio::test]
    async fn combined_chips_match_each_copy_without_changing_its_identity() {
        use mtgscan_domain::collection_query::{CollectionQuery, QueryValue};
        use std::collections::BTreeMap;
        let query = |protected| {
            CollectionQuery::new(BTreeMap::from([
                ("names".into(), QueryValue::List(vec!["sol ring".into()])),
                ("finishes".into(), QueryValue::List(vec!["foil".into()])),
                (
                    "conditions_exclude".into(),
                    QueryValue::List(vec!["damaged".into()]),
                ),
                ("user_tags".into(), QueryValue::List(vec!["SIGNED".into()])),
                ("is_protected".into(), QueryValue::Flag(protected)),
            ]))
            .unwrap()
        };
        let matched = search_collection(&Auth, &MixedDatabase, Some("credential"), &query(true))
            .await
            .unwrap();
        assert_eq!(matched.copies, vec![sample_copy("stable-a")]);
        let unmatched = search_collection(&Auth, &MixedDatabase, Some("credential"), &query(false))
            .await
            .unwrap();
        assert!(unmatched.copies.is_empty());
    }

    struct OrderedDatabase;
    impl ReadCollection for OrderedDatabase {
        fn read_cursor(
            &self,
            _: &str,
            _: &CollectionQuery,
            token: &str,
        ) -> Result<PageCursor, QueryError> {
            Ok(PageCursor {
                search_id: "search-a".into(),
                after: SortKey {
                    missing: false,
                    primary: -300.0,
                    secondary: 0.0,
                    name: "cardc".into(),
                    printing_id: "printing-a".into(),
                    copy_id: token.into(),
                },
            })
        }
        fn write_cursor(
            &self,
            _: &str,
            _: &CollectionQuery,
            cursor: &PageCursor,
        ) -> Result<String, QueryError> {
            Ok(cursor.after.copy_id.clone())
        }
        async fn read_search(
            &self,
            _: &str,
            _: &CollectionQuery,
        ) -> Result<SearchSnapshot, CollectionRefusal> {
            let mut copies = vec![];
            for (id, cents) in [("a", Some(100)), ("b", None), ("c", Some(300))] {
                let mut copy = sample_copy(id);
                copy.current_price = cents.map(|usd_cents| mtgscan_domain::collection::Price {
                    usd_cents,
                    stale: false,
                });
                let (mana_value, created_at, released_at, edhrec_rank, text_tier) = match id {
                    "a" => (3.0, 300.0, 2.0, None, 2.0),
                    "b" => (1.0, 100.0, 3.0, Some(20.0), 0.0),
                    _ => (2.0, 200.0, 1.0, Some(10.0), 1.0),
                };
                copies.push((
                    OwnedCopy {
                        owner_id: "owner-a".into(),
                        copy,
                    },
                    CardFacts {
                        name_key: format!("card{id}"),
                        mana_value,
                        created_at,
                        released_at,
                        edhrec_rank,
                        text_tier,
                        text_match: true,
                        ..Default::default()
                    },
                ));
            }
            Ok(SearchSnapshot {
                copies,
                ..Default::default()
            })
        }
        async fn read_copies(
            &self,
            _: &str,
            _: Option<&str>,
        ) -> Result<Vec<OwnedCopy>, CollectionRefusal> {
            Ok(vec![])
        }
    }

    #[tokio::test]
    async fn user_tag_names_match_without_ascii_only_case_restrictions() {
        use mtgscan_domain::collection_query::QueryValue;
        let query = CollectionQuery::new(BTreeMap::from([(
            "user_tags".into(),
            QueryValue::List(vec!["étiquette".into()]),
        )]))
        .unwrap();
        let mut snapshot = MixedDatabase.read_search("owner-a", &query).await.unwrap();
        snapshot.copies[0].0.copy.user_tags[0].name = "ÉTIQUETTE".into();
        snapshot
            .known_values
            .insert("user_tags".into(), vec!["ÉTIQUETTE".into()]);
        assert!(query.validate_known(&snapshot.known_values).is_ok());
        assert!(query.matches_copy(&snapshot.copies[0].0.copy));
    }

    #[tokio::test]
    async fn price_order_keeps_missing_prices_last_and_limits_copies_not_groups() {
        use mtgscan_domain::collection_query::QueryValue;
        let query = CollectionQuery::new(BTreeMap::from([
            ("sort".into(), QueryValue::Text("price".into())),
            ("sort_order".into(), QueryValue::Text("desc".into())),
            ("limit".into(), QueryValue::Number(2.0)),
        ]))
        .unwrap();
        let page = search_collection(&Auth, &OrderedDatabase, Some("credential"), &query)
            .await
            .unwrap();
        assert_eq!(page.total_count, Some(3));
        assert_eq!(
            page.copies
                .iter()
                .map(|copy| copy.copy_id.as_str())
                .collect::<Vec<_>>(),
            ["c", "a"]
        );
    }

    #[tokio::test]
    async fn collection_orders_keep_the_current_direction_missing_value_and_relevance_rules() {
        use mtgscan_domain::collection_query::QueryValue;
        for (sort, order, text, expected) in [
            ("name", "asc", false, ["a", "b", "c"]),
            ("name", "desc", false, ["c", "b", "a"]),
            ("mana_value", "asc", false, ["b", "c", "a"]),
            ("mana_value", "desc", false, ["a", "c", "b"]),
            ("edhrec_rank", "asc", false, ["c", "b", "a"]),
            ("edhrec_rank", "desc", false, ["b", "c", "a"]),
            ("release_date", "asc", false, ["c", "a", "b"]),
            ("release_date", "desc", false, ["b", "a", "c"]),
            ("relevance", "desc", false, ["a", "c", "b"]),
            ("relevance", "asc", false, ["b", "c", "a"]),
            ("relevance", "desc", true, ["b", "c", "a"]),
            ("relevance", "asc", true, ["a", "c", "b"]),
        ] {
            let mut fields = BTreeMap::from([
                ("sort".into(), QueryValue::Text(sort.into())),
                ("sort_order".into(), QueryValue::Text(order.into())),
            ]);
            if text {
                fields.insert("text".into(), QueryValue::Text("card".into()));
            }
            let page = search_collection(
                &Auth,
                &OrderedDatabase,
                Some("credential"),
                &CollectionQuery::new(fields).unwrap(),
            )
            .await
            .unwrap();
            assert_eq!(
                page.copies
                    .iter()
                    .map(|copy| copy.copy_id.as_str())
                    .collect::<Vec<_>>(),
                expected,
                "{sort} {order} text={text}"
            );
        }
    }

    #[tokio::test]
    async fn a_fresh_cursor_continues_after_the_last_copy_and_does_not_repeat_it() {
        use mtgscan_domain::collection_query::QueryValue;
        let query = CollectionQuery::new(BTreeMap::from([
            ("sort".into(), QueryValue::Text("price".into())),
            ("sort_order".into(), QueryValue::Text("desc".into())),
            ("limit".into(), QueryValue::Number(1.0)),
        ]))
        .unwrap();
        let first = search_collection(&Auth, &OrderedDatabase, Some("credential"), &query)
            .await
            .unwrap();
        assert_eq!(first.copies[0].copy_id, "c");
        let token = first
            .next_cursor
            .expect("the remaining copies need a cursor");
        let mut fields = query.fields().clone();
        fields.insert("cursor".into(), QueryValue::Text(token));
        let second = search_collection(
            &Auth,
            &OrderedDatabase,
            Some("credential"),
            &CollectionQuery::new(fields).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(second.copies[0].copy_id, "a");
    }

    #[tokio::test]
    async fn every_negated_chip_excludes_a_matching_copy_instead_of_weakening_other_chips() {
        use mtgscan_domain::collection_query::QueryValue;
        for (field, value) in [
            ("names", "sol ring"),
            ("types", "artifact"),
            ("sets", "c21"),
            ("rarities", "uncommon"),
            ("finishes", "foil"),
            ("conditions", "lightly_played"),
            ("languages", "en"),
            ("user_tags", "Signed"),
        ] {
            let query = CollectionQuery::new(BTreeMap::from([(
                format!("{field}_exclude"),
                QueryValue::List(vec![value.into()]),
            )]))
            .unwrap();
            let page = search_collection(&Auth, &MixedDatabase, Some("credential"), &query)
                .await
                .unwrap();
            assert!(page.copies.is_empty(), "{field}");
        }
    }

    struct SearchDatabase;
    impl ReadCollection for SearchDatabase {
        async fn read_search(
            &self,
            _: &str,
            _: &CollectionQuery,
        ) -> Result<SearchSnapshot, CollectionRefusal> {
            Ok(SearchSnapshot {
                basic_lands: vec![BasicLand {
                    oracle_id: "island".into(),
                    name: "Snow-Covered Island".into(),
                    image_uris: vec![],
                    kind_order: 8,
                    facts: CardFacts {
                        type_line: "Basic Snow Land — Island".into(),
                        text_match: true,
                        ..Default::default()
                    },
                }],
                ..Default::default()
            })
        }
        async fn read_copies(
            &self,
            _: &str,
            _: Option<&str>,
        ) -> Result<Vec<OwnedCopy>, CollectionRefusal> {
            Ok(vec![])
        }
    }

    #[tokio::test]
    async fn a_text_search_with_no_matching_copies_can_return_basic_land_cards() {
        use mtgscan_domain::collection_query::QueryValue;
        let query = CollectionQuery::new(BTreeMap::from([
            ("text".into(), QueryValue::Text("island".into())),
            ("types".into(), QueryValue::List(vec!["snow".into()])),
        ]))
        .unwrap();
        let page = search_collection(&Auth, &SearchDatabase, Some("credential"), &query)
            .await
            .unwrap();
        assert!(page.copies.is_empty());
        assert_eq!(
            page.basic_lands
                .unwrap()
                .iter()
                .map(|land| land.name.as_str())
                .collect::<Vec<_>>(),
            ["Snow-Covered Island"]
        );
        assert_eq!(page.total_count, Some(0));
    }

    struct OfflineDatabase;
    impl ReadCollection for OfflineDatabase {
        async fn read_copies(
            &self,
            _: &str,
            _: Option<&str>,
        ) -> Result<Vec<OwnedCopy>, CollectionRefusal> {
            Err(CollectionRefusal::Unavailable)
        }
    }

    #[tokio::test]
    async fn failed_persistence_is_not_an_empty_collection_or_a_missing_copy() {
        assert_eq!(
            browse_collection(&Auth, &OfflineDatabase, Some("credential")).await,
            Err(CollectionRefusal::Unavailable)
        );
        assert_eq!(
            open_copy(&Auth, &OfflineDatabase, Some("credential"), "stable-a").await,
            Err(CollectionRefusal::Unavailable)
        );
    }

    struct Database;
    impl ReadCollection for Database {
        async fn read_copies(
            &self,
            _: &str,
            _: Option<&str>,
        ) -> Result<Vec<OwnedCopy>, CollectionRefusal> {
            Ok(vec![])
        }
    }

    fn sample_copy(id: &str) -> Copy {
        use mtgscan_domain::collection::{CardPrinting, Face, Price, UserTag};
        Copy {
            copy_id: id.into(),
            printing: CardPrinting {
                printing_id: "printing-a".into(),
                name: "Sol Ring".into(),
                set_code: "c21".into(),
                set_name: "Commander 2021".into(),
                collector_number: "263".into(),
                rarity: "uncommon".into(),
                image_uris: vec!["https://example.test/card.jpg".into()],
                art_crop_uri: Some("https://example.test/art.jpg".into()),
                artist: Some("Mark Tedin".into()),
                type_line: "Artifact".into(),
                mana_cost: "{1}".into(),
                faces: vec![Face {
                    name: "Sol Ring".into(),
                    oracle_text: "{T}: Add {C}{C}.".into(),
                }],
                commander_legality: "legal".into(),
            },
            finish: "foil".into(),
            condition: "lightly_played".into(),
            language: "en".into(),
            protected: true,
            added_at: "2026-10-30T10:00:00Z".into(),
            current_price: Some(Price {
                usd_cents: 150,
                stale: false,
            }),
            purchase_day_usd_cents: Some(100),
            user_tags: vec![UserTag {
                user_tag_id: "tag-a".into(),
                name: "Signed".into(),
            }],
            deck: None,
            held_for: None,
        }
    }

    #[tokio::test]
    async fn a_copy_keeps_its_printing_artist_art_symbols_and_copy_metadata() {
        assert_eq!(
            open_copy(&Auth, &MixedDatabase, Some("credential"), "stable-a")
                .await
                .unwrap(),
            sample_copy("stable-a")
        );
    }

    struct MixedDatabase;
    impl ReadCollection for MixedDatabase {
        async fn read_search(
            &self,
            owner: &str,
            _: &CollectionQuery,
        ) -> Result<SearchSnapshot, CollectionRefusal> {
            Ok(SearchSnapshot {
                copies: self
                    .read_copies(owner, None)
                    .await?
                    .into_iter()
                    .map(|owned| {
                        (
                            owned,
                            CardFacts {
                                name_key: "solring".into(),
                                type_line: "Artifact".into(),
                                ..Default::default()
                            },
                        )
                    })
                    .collect(),
                normalized: BTreeMap::from([("sol ring".into(), "solring".into())]),
                known_values: BTreeMap::from([
                    ("user_tags".into(), vec!["Signed".into()]),
                    ("sets".into(), vec!["c21".into()]),
                ]),
                ..Default::default()
            })
        }
        async fn read_copies(
            &self,
            _: &str,
            _: Option<&str>,
        ) -> Result<Vec<OwnedCopy>, CollectionRefusal> {
            Ok(vec![
                OwnedCopy {
                    owner_id: "owner-a".into(),
                    copy: sample_copy("stable-a"),
                },
                OwnedCopy {
                    owner_id: "owner-b".into(),
                    copy: sample_copy("stable-b"),
                },
            ])
        }
    }

    #[tokio::test]
    async fn an_owner_cannot_browse_another_owners_copies() {
        let copies = browse_collection(&Auth, &MixedDatabase, Some("credential"))
            .await
            .unwrap();
        assert_eq!(
            copies
                .iter()
                .map(|copy| copy.copy_id.as_str())
                .collect::<Vec<_>>(),
            ["stable-a"]
        );
    }

    #[tokio::test]
    async fn opening_a_copy_preserves_its_id_and_refuses_a_different_owners_copy() {
        assert_eq!(
            open_copy(&Auth, &MixedDatabase, Some("credential"), "stable-a")
                .await
                .unwrap()
                .copy_id,
            "stable-a"
        );
        assert_eq!(
            open_copy(&Auth, &MixedDatabase, Some("credential"), "stable-b").await,
            Err(CollectionRefusal::NotFound)
        );
        assert_eq!(
            open_copy(&Auth, &MixedDatabase, Some("credential"), "missing").await,
            Err(CollectionRefusal::NotFound)
        );
    }

    #[tokio::test]
    async fn a_signed_in_owner_can_browse_an_empty_collection() {
        assert_eq!(
            browse_collection(&Auth, &Database, Some("credential")).await,
            Ok(vec![])
        );
    }
}
