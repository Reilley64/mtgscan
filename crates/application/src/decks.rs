use crate::VerifyIdentity;
pub use mtgscan_domain::decks::{
    DeckContents, DeckRefusal, DeckSummary, OwnedDeckContents, OwnedDeckSummary,
};
pub use mtgscan_domain::decks::{DeckName, DeckPriority, MetadataChange};
use mtgscan_domain::{Caller, Refusal};
use std::future::Future;

pub trait ReadDecks: Send + Sync {
    fn list(
        &self,
        owner: &str,
    ) -> impl Future<Output = Result<Vec<OwnedDeckSummary>, DeckRefusal>> + Send;
}

pub trait WriteDeckMetadata: Send + Sync {
    fn create(
        &self,
        owner: &str,
        name: &DeckName,
        priority: DeckPriority,
    ) -> impl Future<Output = Result<String, DeckRefusal>> + Send;
    fn metadata(
        &self,
        owner: &str,
        deck_id: &str,
    ) -> impl Future<Output = Result<Option<OwnedDeckSummary>, DeckRefusal>> + Send;
    fn edit(
        &self,
        owner: &str,
        deck_id: &str,
        change: &MetadataChange,
    ) -> impl Future<Output = Result<(), DeckRefusal>> + Send;
}

async fn owner(
    identity: &impl VerifyIdentity,
    credential: Option<&str>,
) -> Result<String, DeckRefusal> {
    caller(identity, credential)
        .await?
        .native_account()
        .map_err(|_| DeckRefusal::Forbidden)
}

pub async fn create_deck(
    identity: &impl VerifyIdentity,
    database: &impl WriteDeckMetadata,
    credential: Option<&str>,
    name: &str,
) -> Result<String, DeckRefusal> {
    let owner = owner(identity, credential).await?;
    let name = DeckName::new(name)?;
    database.create(&owner, &name, DeckPriority::Medium).await
}

pub async fn edit_deck_metadata(
    identity: &impl VerifyIdentity,
    database: &impl WriteDeckMetadata,
    credential: Option<&str>,
    deck_id: &str,
    change: MetadataChange,
) -> Result<(), DeckRefusal> {
    let owner = owner(identity, credential).await?;
    database
        .metadata(&owner, deck_id)
        .await?
        .filter(|owned| owned.owner_id == owner && owned.deck.deck_id == deck_id)
        .ok_or(DeckRefusal::NotFound)?;
    database.edit(&owner, deck_id, &change).await
}

pub trait ReadDeckContents: Send + Sync {
    fn get(
        &self,
        owner: &str,
        deck_id: &str,
    ) -> impl Future<Output = Result<Option<OwnedDeckContents>, DeckRefusal>> + Send;
}

pub async fn get_deck(
    identity: &impl VerifyIdentity,
    database: &impl ReadDeckContents,
    credential: Option<&str>,
    deck_id: &str,
) -> Result<DeckContents, DeckRefusal> {
    let caller = caller(identity, credential).await?;
    database
        .get(caller.collection_owner(), deck_id)
        .await?
        .filter(|owned| {
            owned.owner_id == caller.collection_owner() && owned.deck.summary.deck_id == deck_id
        })
        .map(|owned| owned.deck)
        .ok_or(DeckRefusal::NotFound)
}

async fn caller(
    identity: &impl VerifyIdentity,
    credential: Option<&str>,
) -> Result<Caller, DeckRefusal> {
    let credential = credential
        .filter(|value| !value.is_empty())
        .ok_or(DeckRefusal::Unauthenticated)?;
    identity
        .verify(credential)
        .await
        .map_err(|error| match error {
            Refusal::Unauthenticated => DeckRefusal::Unauthenticated,
            Refusal::McpTokenForbidden => DeckRefusal::Forbidden,
            Refusal::Unavailable => DeckRefusal::Unavailable,
        })
}

pub async fn browse_decks(
    identity: &impl VerifyIdentity,
    database: &impl ReadDecks,
    credential: Option<&str>,
) -> Result<Vec<DeckSummary>, DeckRefusal> {
    let caller = caller(identity, credential).await?;
    let mut decks: Vec<_> = database
        .list(caller.collection_owner())
        .await?
        .into_iter()
        .filter(|owned| owned.owner_id == caller.collection_owner())
        .map(|owned| owned.deck)
        .collect();
    decks.sort_by(|a, b| {
        b.last_used_at
            .cmp(&a.last_used_at)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.deck_id.cmp(&b.deck_id))
    });
    Ok(decks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use mtgscan_domain::{Caller, Refusal};

    struct Identity;
    impl VerifyIdentity for Identity {
        async fn verify(&self, credential: &str) -> Result<Caller, Refusal> {
            match credential {
                "invalid" => Err(Refusal::Unauthenticated),
                "offline" => Err(Refusal::Unavailable),
                "ai" => Ok(Caller::ai_client("owner-a".into(), "client-a".into())),
                _ => Ok(Caller::user("owner-a".into())),
            }
        }
    }

    fn summary(id: &str, name: &str, used: &str) -> DeckSummary {
        use mtgscan_domain::decks::{Commander, EvaluationSummary};
        DeckSummary {
            deck_id: id.into(),
            name: name.into(),
            priority: "high".into(),
            revision: 7,
            card_count: 63,
            last_used_at: used.into(),
            needs_you_count: 2,
            commanders: vec![Commander {
                copy_id: "exact-commander".into(),
                name: "Atraxa".into(),
                art_crop_uri: Some("https://example.test/art.jpg".into()),
            }],
            evaluation: Some(EvaluationSummary {
                validity: "invalid".into(),
                validity_stale: true,
                estimated_bracket: 3,
                bracket_stale: false,
            }),
        }
    }

    struct Gallery;
    impl ReadDecks for Gallery {
        async fn list(&self, _: &str) -> Result<Vec<OwnedDeckSummary>, DeckRefusal> {
            Ok(vec![
                OwnedDeckSummary {
                    owner_id: "owner-a".into(),
                    deck: summary("b", "Beta", "2026-11-01T00:00:00Z"),
                },
                OwnedDeckSummary {
                    owner_id: "owner-b".into(),
                    deck: summary("private", "Private", "2026-11-03T00:00:00Z"),
                },
                OwnedDeckSummary {
                    owner_id: "owner-a".into(),
                    deck: summary("a", "alpha", "2026-11-01T00:00:00Z"),
                },
                OwnedDeckSummary {
                    owner_id: "owner-a".into(),
                    deck: summary("recent", "Zeta", "2026-11-02T00:00:00Z"),
                },
            ])
        }
    }

    #[tokio::test]
    async fn the_gallery_preserves_metadata_and_sorts_owned_decks_by_recent_use_then_name() {
        let decks = browse_decks(&Identity, &Gallery, Some("owner"))
            .await
            .unwrap();
        assert_eq!(
            decks
                .iter()
                .map(|deck| deck.deck_id.as_str())
                .collect::<Vec<_>>(),
            ["recent", "a", "b"]
        );
        assert_eq!(decks[1], summary("a", "alpha", "2026-11-01T00:00:00Z"));
        assert_eq!(
            browse_decks(&Identity, &Gallery, Some("invalid")).await,
            Err(DeckRefusal::Unauthenticated)
        );
        assert_eq!(
            browse_decks(&Identity, &Gallery, Some("offline")).await,
            Err(DeckRefusal::Unavailable)
        );
    }

    struct Contents;
    impl ReadDeckContents for Contents {
        async fn get(&self, _: &str, id: &str) -> Result<Option<OwnedDeckContents>, DeckRefusal> {
            use mtgscan_domain::decks::BasicLand;
            Ok(Some(OwnedDeckContents {
                owner_id: if id == "private" {
                    "owner-b"
                } else {
                    "owner-a"
                }
                .into(),
                deck: DeckContents {
                    summary: DeckSummary {
                        card_count: 8,
                        evaluation: None,
                        ..summary(id, "Same name", "2026-11-01T00:00:00Z")
                    },
                    created_at: "2026-10-01T00:00:00Z".into(),
                    cards: vec![],
                    basic_lands: vec![BasicLand {
                        oracle_id: Some("island".into()),
                        name: "Island".into(),
                        image_uris: vec![],
                        count: 8,
                    }],
                    evaluation: None,
                },
            }))
        }
    }

    #[tokio::test]
    async fn deck_contents_keep_basic_land_counts_distinct_from_exact_copies_and_refuse_another_owner()
     {
        let deck = get_deck(&Identity, &Contents, Some("ai"), "stable")
            .await
            .unwrap();
        assert_eq!(deck.summary.deck_id, "stable");
        assert_eq!(deck.summary.revision, 7);
        assert_eq!(deck.summary.card_count, 8);
        assert!(deck.cards.is_empty());
        assert_eq!(deck.basic_lands[0].count, 8);
        assert_eq!(deck.basic_lands[0].oracle_id.as_deref(), Some("island"));
        assert_eq!(
            get_deck(&Identity, &Contents, Some("owner"), "private").await,
            Err(DeckRefusal::NotFound)
        );
    }

    #[derive(Default)]
    struct MetadataDatabase(std::sync::Mutex<Vec<OwnedDeckSummary>>);
    impl ReadDecks for MetadataDatabase {
        async fn list(&self, _: &str) -> Result<Vec<OwnedDeckSummary>, DeckRefusal> {
            Ok(self.0.lock().unwrap().clone())
        }
    }
    impl WriteDeckMetadata for MetadataDatabase {
        async fn create(
            &self,
            owner: &str,
            name: &DeckName,
            priority: DeckPriority,
        ) -> Result<String, DeckRefusal> {
            let mut decks = self.0.lock().unwrap();
            let id = format!("deck-{}", decks.len());
            let mut deck = summary(&id, name.as_str(), "2026-11-02T00:00:00Z");
            deck.priority = priority.as_str().into();
            deck.revision = 0;
            deck.card_count = 0;
            deck.commanders.clear();
            deck.evaluation = None;
            deck.needs_you_count = 0;
            decks.push(OwnedDeckSummary {
                owner_id: owner.into(),
                deck,
            });
            Ok(id)
        }
        async fn metadata(
            &self,
            _: &str,
            id: &str,
        ) -> Result<Option<OwnedDeckSummary>, DeckRefusal> {
            Ok(self
                .0
                .lock()
                .unwrap()
                .iter()
                .find(|owned| owned.deck.deck_id == id)
                .cloned())
        }
        async fn edit(
            &self,
            owner: &str,
            id: &str,
            change: &MetadataChange,
        ) -> Result<(), DeckRefusal> {
            let mut decks = self.0.lock().unwrap();
            let deck = &mut decks
                .iter_mut()
                .find(|owned| owned.owner_id == owner && owned.deck.deck_id == id)
                .ok_or(DeckRefusal::NotFound)?
                .deck;
            match change {
                MetadataChange::Rename(name) => deck.name = name.as_str().into(),
                MetadataChange::Priority(priority) => deck.priority = priority.as_str().into(),
                MetadataChange::Used => (),
            }
            deck.last_used_at = "2026-11-03T00:00:00Z".into();
            Ok(())
        }
    }

    #[tokio::test]
    async fn an_owner_creates_duplicate_trimmed_names_at_medium_priority_without_a_deck_change() {
        let database = MetadataDatabase::default();
        let first = create_deck(&Identity, &database, Some("owner"), "  Same name  ")
            .await
            .unwrap();
        let second = create_deck(&Identity, &database, Some("owner"), "Same name")
            .await
            .unwrap();
        assert_ne!(first, second);
        let decks = browse_decks(&Identity, &database, Some("owner"))
            .await
            .unwrap();
        assert_eq!(decks.len(), 2);
        for deck in decks {
            assert_eq!(deck.name, "Same name");
            assert_eq!(deck.priority, "medium");
            assert_eq!(deck.revision, 0);
            assert_eq!(deck.card_count, 0);
            assert!(deck.evaluation.is_none());
        }
        for name in [" \n ".to_string(), "x".repeat(65)] {
            assert_eq!(
                create_deck(&Identity, &database, Some("owner"), &name).await,
                Err(DeckRefusal::InvalidName)
            );
        }
        assert_eq!(
            browse_decks(&Identity, &database, Some("owner"))
                .await
                .unwrap()
                .len(),
            2
        );
    }

    #[tokio::test]
    async fn metadata_edits_preserve_revision_and_forbid_ai_and_wrong_owner_callers() {
        let database = MetadataDatabase(std::sync::Mutex::new(vec![
            OwnedDeckSummary {
                owner_id: "owner-a".into(),
                deck: summary("mine", "Old name", "2026-11-01T00:00:00Z"),
            },
            OwnedDeckSummary {
                owner_id: "owner-b".into(),
                deck: summary("private", "Other name", "2026-11-01T00:00:00Z"),
            },
        ]));
        for change in [
            MetadataChange::Rename(DeckName::new("Same name").unwrap()),
            MetadataChange::Priority(DeckPriority::Low),
            MetadataChange::Used,
        ] {
            assert_eq!(
                edit_deck_metadata(&Identity, &database, Some("ai"), "mine", change.clone()).await,
                Err(DeckRefusal::Forbidden)
            );
            assert_eq!(
                edit_deck_metadata(
                    &Identity,
                    &database,
                    Some("owner"),
                    "private",
                    change.clone()
                )
                .await,
                Err(DeckRefusal::NotFound)
            );
            edit_deck_metadata(&Identity, &database, Some("owner"), "mine", change)
                .await
                .unwrap();
        }
        assert_eq!(
            create_deck(&Identity, &database, Some("ai"), "Forbidden").await,
            Err(DeckRefusal::Forbidden)
        );
        let decks = browse_decks(&Identity, &database, Some("owner"))
            .await
            .unwrap();
        assert_eq!(decks.len(), 1);
        assert_eq!(decks[0].name, "Same name");
        assert_eq!(decks[0].priority, "low");
        assert_eq!(decks[0].revision, 7);
        assert_eq!(decks[0].card_count, 63);
        assert_eq!(
            decks[0].evaluation,
            summary("mine", "Old name", "2026-11-01T00:00:00Z").evaluation
        );
        assert_eq!(decks[0].last_used_at, "2026-11-03T00:00:00Z");
    }

    struct EmptyDatabase;
    impl ReadDecks for EmptyDatabase {
        async fn list(&self, _: &str) -> Result<Vec<OwnedDeckSummary>, DeckRefusal> {
            Ok(vec![])
        }
    }

    #[tokio::test]
    async fn an_owner_or_ai_client_can_browse_an_empty_deck_gallery() {
        for credential in ["owner", "ai"] {
            assert_eq!(
                browse_decks(&Identity, &EmptyDatabase, Some(credential)).await,
                Ok(vec![])
            );
        }
        assert_eq!(
            browse_decks(&Identity, &EmptyDatabase, None).await,
            Err(DeckRefusal::Unauthenticated)
        );
    }
}
