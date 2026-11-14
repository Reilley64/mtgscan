use crate::VerifyIdentity;
use mtgscan_catalog_contract::{CatalogErrorCode, CatalogRefusal, CatalogRequest, CatalogResult};
use mtgscan_domain::{Caller, Refusal};
use std::future::Future;

pub trait ReadCatalog: Send + Sync {
    fn query(
        &self,
        caller: &Caller,
        request: CatalogRequest,
    ) -> impl Future<Output = Result<CatalogResult, CatalogRefusal>> + Send;
}

pub async fn query_catalog(
    identity: &impl VerifyIdentity,
    database: &impl ReadCatalog,
    credential: Option<&str>,
    request: CatalogRequest,
) -> Result<CatalogResult, CatalogRefusal> {
    let caller = crate::verified_caller(identity, credential)
        .await
        .map_err(|error| CatalogRefusal {
            code: match error {
                Refusal::Unauthenticated => CatalogErrorCode::Unauthenticated,
                Refusal::McpTokenForbidden => CatalogErrorCode::Forbidden,
                Refusal::Unavailable => CatalogErrorCode::Unavailable,
            },
            field: None,
        })?;
    request.validate()?;
    database.query(&caller, request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use mtgscan_catalog_contract::*;
    use mtgscan_domain::{Caller, Refusal};

    struct Identity;
    impl VerifyIdentity for Identity {
        async fn verify(&self, credential: &str) -> Result<Caller, Refusal> {
            match credential {
                "ai" => Ok(Caller::ai_client("owner-a".into(), "client-a".into())),
                "valid" => Ok(Caller::user("owner-a".into())),
                _ => Err(Refusal::Unauthenticated),
            }
        }
    }

    struct Database;
    impl ReadCatalog for Database {
        async fn query(
            &self,
            caller: &Caller,
            request: CatalogRequest,
        ) -> Result<CatalogResult, CatalogRefusal> {
            if caller.collection_owner() != "owner-a" {
                return Err(CatalogRefusal::unavailable());
            }
            match request {
                CatalogRequest::Search(query) if query.text.as_deref() == Some("Sol Ring") => {
                    Ok(CatalogResult::Search(CatalogPage {
                        items: vec![],
                        next_cursor: Some("opaque-next-page".into()),
                        search_id: "search-a".into(),
                        freshness: CatalogFreshness {
                            rules_data_as_of: "2026-11-13T00:00:00Z".into(),
                            rules_stale: false,
                        },
                        prices: PriceFreshness {
                            prices_observed_at: None,
                            prices_stale: true,
                        },
                    }))
                }
                _ => Err(CatalogRefusal::unavailable()),
            }
        }
    }

    struct CriteriaDatabase;
    impl ReadCatalog for CriteriaDatabase {
        async fn query(
            &self,
            caller: &Caller,
            request: CatalogRequest,
        ) -> Result<CatalogResult, CatalogRefusal> {
            let CatalogRequest::Search(query) = request else {
                return Err(CatalogRefusal::unavailable());
            };
            if caller.ai_client_id() != Some("client-a")
                || caller.collection_owner() != "owner-a"
                || query.names_exclude.as_deref() != Some(&["Signet".to_string()])
                || query.identity_subset_of != Some(vec![])
                || query.mana_value_min != Some(2.0)
                || query.mana_value_max != Some(2.0)
                || query.price_min.as_deref() != Some("1.50")
                || query.price_max.as_deref() != Some("1.50")
                || query.tags_exclude.as_deref() != Some(&["draw".to_string()])
                || query.sort.as_deref() != Some("price")
                || query.sort_order.as_deref() != Some("desc")
                || query.cursor.as_deref() != Some("query-bound-cursor")
                || query.limit != Some(1.0)
            {
                return Err(CatalogRefusal::unavailable());
            }
            Ok(CatalogResult::Search(CatalogPage {
                items: vec![],
                next_cursor: None,
                search_id: "preserved-criteria".into(),
                freshness: CatalogFreshness {
                    rules_data_as_of: "2026-11-13T00:00:00Z".into(),
                    rules_stale: false,
                },
                prices: PriceFreshness {
                    prices_observed_at: None,
                    prices_stale: true,
                },
            }))
        }
    }

    #[tokio::test]
    async fn negated_chips_inclusive_bounds_colorless_identity_and_pagination_reach_catalog_execution_unchanged()
     {
        let request = CatalogOperation::Search.parse_json(r#"{"names_exclude":["Signet"],"identity_subset_of":[],"mana_value_min":2,"mana_value_max":2,"price_min":"1.50","price_max":"1.50","tags_exclude":["draw"],"sort":"price","sort_order":"desc","limit":1,"cursor":"query-bound-cursor"}"#).unwrap();
        let CatalogResult::Search(page) =
            query_catalog(&Identity, &CriteriaDatabase, Some("ai"), request)
                .await
                .unwrap()
        else {
            panic!("catalog page required")
        };
        assert_eq!(page.search_id, "preserved-criteria");
    }

    #[tokio::test]
    async fn oracle_tag_lookup_requires_text_and_limits_the_lookup_without_accepting_user_tags() {
        for (json, field) in [
            (r#"{}"#, "text"),
            (r#"{"text":"draw","limit":21}"#, "limit"),
            (r#"{"text":"---"}"#, "text"),
        ] {
            let request = CatalogOperation::Tags.parse_json(json).unwrap();
            let refusal = query_catalog(&Identity, &Database, Some("valid"), request)
                .await
                .unwrap_err();
            assert_eq!(refusal.code, CatalogErrorCode::InvalidArgument);
            assert_eq!(refusal.field.as_deref(), Some(field));
        }
    }

    #[tokio::test]
    async fn catalog_chips_refuse_invalid_values_without_turning_them_into_empty_results() {
        for (json, field) in [
            (r#"{"text":"---"}"#, Some("text")),
            (r#"{"mana_value_min":2.5}"#, Some("mana_value_min")),
            (r#"{"power_min":-100}"#, Some("power_min")),
            (r#"{"price_min":"1.234"}"#, Some("price_min")),
            (
                r#"{"price_min":"2.00","price_max":"1.99"}"#,
                Some("price_max"),
            ),
            (r#"{"colors":["W","W"]}"#, Some("colors[1]")),
            (r#"{"colors":["blue"]}"#, Some("colors[0]")),
            (r#"{"sets":["MH3","mh3"]}"#, Some("sets[1]")),
            (r#"{"types":[]}"#, Some("types")),
            (r#"{"text":"ring","sort":"added"}"#, Some("sort")),
            (r#"{"sort":"relevance"}"#, Some("sort")),
            (r#"{}"#, None),
        ] {
            let request = CatalogOperation::Search.parse_json(json).unwrap();
            let refusal = query_catalog(&Identity, &Database, Some("valid"), request)
                .await
                .unwrap_err();
            assert_eq!(refusal.code, CatalogErrorCode::InvalidArgument, "{json}");
            assert_eq!(refusal.field.as_deref(), field, "{json}");
        }
    }

    #[tokio::test]
    async fn card_queries_refuse_mixed_identity_lists_and_empty_printing_identity() {
        for (request, field) in [
            (
                CatalogRequest::Cards(CardDetailsQuery {
                    oracle_ids: Some(vec!["10000000-0000-4000-8000-000000000001".into()]),
                    printing_ids: Some(vec!["20000000-0000-4000-8000-000000000001".into()]),
                }),
                "printing_ids",
            ),
            (
                CatalogRequest::Printings(CardPrintingsQuery::default()),
                "oracle_id",
            ),
        ] {
            let error = query_catalog(&Identity, &Database, Some("valid"), request)
                .await
                .unwrap_err();
            assert_eq!(error.code, CatalogErrorCode::InvalidArgument);
            assert_eq!(error.field.as_deref(), Some(field));
        }
    }

    #[tokio::test]
    async fn anonymous_callers_are_refused_before_any_catalog_or_owned_quantity_read() {
        let request = || {
            CatalogRequest::Search(
                CatalogQuery {
                    text: Some("Sol Ring".into()),
                    ..Default::default()
                }
                .into(),
            )
        };
        for credential in [None, Some(""), Some("invalid")] {
            let refusal = query_catalog(&Identity, &Database, credential, request())
                .await
                .unwrap_err();
            assert_eq!(refusal.code, CatalogErrorCode::Unauthenticated);
            assert_eq!(refusal.field, None);
        }
    }

    #[tokio::test]
    async fn catalog_filter_bounds_and_unknown_fields_keep_the_field_at_fault() {
        let request = CatalogRequest::Search(
            CatalogQuery {
                mana_value_min: Some(3.0),
                mana_value_max: Some(2.0),
                ..Default::default()
            }
            .into(),
        );
        let refusal = query_catalog(&Identity, &Database, Some("valid"), request)
            .await
            .unwrap_err();
        assert_eq!(refusal.code, CatalogErrorCode::InvalidArgument);
        assert_eq!(refusal.field.as_deref(), Some("mana_value_max"));
    }

    #[tokio::test]
    async fn catalog_search_keeps_text_pagination_and_verified_user_or_ai_read_authority() {
        for credential in ["valid", "ai"] {
            let request = CatalogRequest::Search(
                CatalogQuery {
                    text: Some("Sol Ring".into()),
                    ..Default::default()
                }
                .into(),
            );
            let CatalogResult::Search(page) =
                query_catalog(&Identity, &Database, Some(credential), request)
                    .await
                    .unwrap()
            else {
                panic!("catalog page required")
            };
            assert_eq!(page.next_cursor.as_deref(), Some("opaque-next-page"));
            assert_eq!(page.search_id, "search-a");
            assert!(page.prices.prices_stale);
        }
    }
}
