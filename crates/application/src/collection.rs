use crate::VerifyIdentity;
pub use mtgscan_domain::collection::{CollectionRefusal, Copy, OwnedCopy};
use mtgscan_domain::{Caller, Refusal};
use std::future::Future;

pub trait ReadCollection: Send + Sync {
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
    crate::verified_caller(identity, credential)
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
