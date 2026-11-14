use crate::VerifyIdentity;
use mtgscan_domain::collection::CollectionRefusal;
use mtgscan_domain::sets::*;
use std::future::Future;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SetsError {
    Refused(CollectionRefusal),
    InvalidArgument(&'static str),
    InvalidCursor,
}

pub trait ReadSets: Send + Sync {
    fn catalog(&self) -> impl Future<Output = Result<SetCatalog, CollectionRefusal>> + Send;
    fn printings(
        &self,
        owner: &str,
        codes: &[String],
    ) -> impl Future<Output = Result<Vec<SetPrinting>, CollectionRefusal>> + Send;
}

async fn owner(
    identity: &impl VerifyIdentity,
    credential: Option<&str>,
) -> Result<String, SetsError> {
    let caller = crate::collection::caller(identity, credential)
        .await
        .map_err(SetsError::Refused)?;
    Ok(caller.collection_owner().into())
}

pub async fn open_set(
    identity: &impl VerifyIdentity,
    database: &impl ReadSets,
    credential: Option<&str>,
    code: &str,
) -> Result<SetPage, SetsError> {
    let owner = owner(identity, credential).await?;
    if !(1..=16).contains(&code.chars().count()) {
        return Err(SetsError::InvalidArgument("code"));
    }
    let catalog = database.catalog().await.map_err(SetsError::Refused)?;
    let set = catalog
        .sets
        .into_iter()
        .find(|set| set.code == code && set.released_at <= catalog.today)
        .ok_or(SetsError::Refused(CollectionRefusal::NotFound))?;
    let printings = database
        .printings(&owner, &[code.into()])
        .await
        .map_err(SetsError::Refused)?;
    if !printings.iter().any(|p| p.set_code == code && !p.absent) {
        return Err(SetsError::Refused(CollectionRefusal::NotFound));
    }
    Ok(set_page(set, printings, &owner))
}

#[derive(Debug, Clone)]
pub struct SetListQuery {
    pub finish_view: FinishView,
    pub text: Option<String>,
    pub limit: usize,
    pub cursor: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct SetList {
    pub items: Vec<SetPage>,
    pub next_cursor: Option<String>,
}

fn cursor(query: &SetListQuery, code: &str) -> String {
    let text = query.text.as_deref().unwrap_or("");
    format!(
        "{}:{}:{}:{}",
        query.finish_view.key(),
        text.len(),
        text,
        code
    )
}

pub async fn browse_sets(
    identity: &impl VerifyIdentity,
    database: &impl ReadSets,
    credential: Option<&str>,
    query: &SetListQuery,
) -> Result<SetList, SetsError> {
    let owner = owner(identity, credential).await?;
    if !(1..=50).contains(&query.limit) {
        return Err(SetsError::InvalidArgument("limit"));
    }
    if query
        .text
        .as_ref()
        .is_some_and(|text| !(1..=100).contains(&text.chars().count()))
    {
        return Err(SetsError::InvalidArgument("text"));
    }
    let catalog = database.catalog().await.map_err(SetsError::Refused)?;
    let text = query.text.as_ref().map(|text| text.to_lowercase());
    let mut sets: Vec<_> = catalog
        .sets
        .into_iter()
        .filter(|set| {
            set.released_at <= catalog.today
                && text.as_ref().is_none_or(|text| {
                    set.name.to_lowercase().contains(text) || set.code.to_lowercase().contains(text)
                })
        })
        .collect();
    sets.sort_by(|a, b| {
        b.released_at
            .cmp(&a.released_at)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.code.cmp(&b.code))
    });
    let start = if let Some(after) = &query.cursor {
        sets.iter()
            .position(|set| cursor(query, &set.code) == *after)
            .ok_or(SetsError::InvalidCursor)?
            + 1
    } else {
        0
    };
    let mut items = vec![];
    for chunk in sets[start..].chunks(query.limit + 1) {
        let codes: Vec<_> = chunk.iter().map(|set| set.code.clone()).collect();
        let printings = database
            .printings(&owner, &codes)
            .await
            .map_err(SetsError::Refused)?;
        for set in chunk {
            let page = set_page(
                set.clone(),
                printings
                    .iter()
                    .filter(|p| p.set_code == set.code)
                    .cloned()
                    .collect(),
                &owner,
            );
            if page.completion.in_view(query.finish_view).size > 0 {
                items.push(page);
            }
            if items.len() > query.limit {
                items.pop();
                let next_cursor = items.last().map(|item| cursor(query, &item.set.code));
                return Ok(SetList { items, next_cursor });
            }
        }
    }
    Ok(SetList {
        items,
        next_cursor: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use mtgscan_domain::{Caller, Refusal};

    struct Identity;
    impl VerifyIdentity for Identity {
        async fn verify(&self, token: &str) -> Result<Caller, Refusal> {
            match token {
                "invalid" => Err(Refusal::Unauthenticated),
                "offline" => Err(Refusal::Unavailable),
                "ai" => Ok(Caller::ai_client("owner-a".into(), "client".into())),
                _ => Ok(Caller::user("owner-a".into())),
            }
        }
    }

    struct Database;
    impl ReadSets for Database {
        async fn catalog(&self) -> Result<SetCatalog, CollectionRefusal> {
            Ok(SetCatalog {
                today: "2027-01-04".into(),
                sets: vec![CardSet {
                    code: "tst".into(),
                    name: "Test set".into(),
                    released_at: "2026-01-01".into(),
                    icon_svg_uri: "https://example.test/set.svg".into(),
                    sections: vec![],
                }],
            })
        }
        async fn printings(
            &self,
            owner: &str,
            _: &[String],
        ) -> Result<Vec<SetPrinting>, CollectionRefusal> {
            let mut printing = SetPrinting {
                set_code: "tst".into(),
                printing_id: "printing-a".into(),
                name: "Card A".into(),
                collector_number: "1".into(),
                image_uri: None,
                art_crop_uri: None,
                finishes: vec!["nonfoil".into(), "foil".into()],
                booster: true,
                promo: false,
                variation: false,
                basic_land: false,
                absent: false,
                prices: [None; 3],
                copy_counts_by_finish: vec![],
                sections: vec![],
            };
            for (owner_id, finish) in [
                ("owner-a", "foil"),
                ("owner-a", "foil"),
                ("owner-b", "nonfoil"),
            ] {
                printing.copy_counts_by_finish.push(CopyCountByFinish {
                    owner_id: owner_id.into(),
                    finish: finish.into(),
                    quantity: 1,
                });
            }
            assert_eq!(owner, "owner-a");
            Ok(vec![printing])
        }
    }

    struct PagedDatabase;
    impl ReadSets for PagedDatabase {
        async fn catalog(&self) -> Result<SetCatalog, CollectionRefusal> {
            let mut catalog = Database.catalog().await?;
            catalog.sets = (0..25)
                .map(|index| CardSet {
                    code: format!("s{index:02}"),
                    name: format!("Set {index:02}"),
                    released_at: if index == 24 {
                        "2028-01-01".into()
                    } else {
                        "2026-01-01".into()
                    },
                    ..catalog.sets[0].clone()
                })
                .rev()
                .collect();
            Ok(catalog)
        }
        async fn printings(
            &self,
            owner: &str,
            codes: &[String],
        ) -> Result<Vec<SetPrinting>, CollectionRefusal> {
            let sample = Database.printings(owner, &[]).await?.remove(0);
            Ok(codes
                .iter()
                .map(|code| SetPrinting {
                    set_code: code.clone(),
                    finishes: if code == "s00" {
                        vec!["nonfoil".into()]
                    } else {
                        sample.finishes.clone()
                    },
                    ..sample.clone()
                })
                .collect())
        }
    }

    #[tokio::test]
    async fn sets_page_after_finish_availability_and_match_name_or_code_on_the_server() {
        let query = SetListQuery {
            finish_view: FinishView::Foil,
            text: None,
            limit: 20,
            cursor: None,
        };
        let page = browse_sets(&Identity, &PagedDatabase, Some("ai"), &query)
            .await
            .unwrap();
        assert_eq!(page.items.len(), 20);
        assert_eq!(page.items[0].set.code, "s01");
        assert_eq!(page.items[19].set.code, "s20");
        let next = browse_sets(
            &Identity,
            &PagedDatabase,
            Some("token"),
            &SetListQuery {
                cursor: page.next_cursor.clone(),
                ..query.clone()
            },
        )
        .await
        .unwrap();
        assert_eq!(
            next.items
                .iter()
                .map(|s| s.set.code.as_str())
                .collect::<Vec<_>>(),
            ["s21", "s22", "s23"]
        );
        assert_eq!(next.next_cursor, None);
        let stale = browse_sets(
            &Identity,
            &PagedDatabase,
            Some("token"),
            &SetListQuery {
                cursor: page.next_cursor,
                finish_view: FinishView::Any,
                ..query.clone()
            },
        )
        .await;
        assert_eq!(stale, Err(SetsError::InvalidCursor));
        for text in ["s02", "SET 02"] {
            let found = browse_sets(
                &Identity,
                &PagedDatabase,
                Some("token"),
                &SetListQuery {
                    text: Some(text.into()),
                    ..query.clone()
                },
            )
            .await
            .unwrap();
            assert_eq!(found.items[0].set.code, "s02");
        }
    }

    struct Offline;
    impl ReadSets for Offline {
        async fn catalog(&self) -> Result<SetCatalog, CollectionRefusal> {
            Err(CollectionRefusal::Unavailable)
        }
        async fn printings(
            &self,
            _: &str,
            _: &[String],
        ) -> Result<Vec<SetPrinting>, CollectionRefusal> {
            Err(CollectionRefusal::Unavailable)
        }
    }

    #[tokio::test]
    async fn sets_preserve_refusals_and_do_not_turn_outages_into_empty_results() {
        for credential in [None, Some(""), Some("invalid")] {
            assert_eq!(
                open_set(&Identity, &Database, credential, "tst").await,
                Err(SetsError::Refused(CollectionRefusal::Unauthenticated))
            );
        }
        assert_eq!(
            open_set(&Identity, &Offline, Some("token"), "tst").await,
            Err(SetsError::Refused(CollectionRefusal::Unavailable))
        );
        assert_eq!(
            open_set(&Identity, &Database, Some("offline"), "tst").await,
            Err(SetsError::Refused(CollectionRefusal::Unavailable))
        );
        assert_eq!(
            open_set(&Identity, &Database, Some("token"), "missing").await,
            Err(SetsError::Refused(CollectionRefusal::NotFound))
        );
        assert_eq!(
            open_set(&Identity, &Database, Some("token"), "").await,
            Err(SetsError::InvalidArgument("code"))
        );
        assert!(
            open_set(&Identity, &Database, Some("ai"), "tst")
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn completion_counts_unique_printings_and_only_the_verified_owners_copies() {
        let page = open_set(&Identity, &Database, Some("token"), "tst")
            .await
            .unwrap();
        assert_eq!(page.completion.any, Completion { owned: 1, size: 1 });
        assert_eq!(page.completion.nonfoil, Completion { owned: 0, size: 1 });
        assert_eq!(page.main_set[0].counts.foil, Some(2));
    }
}
