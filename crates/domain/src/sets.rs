#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FinishView {
    #[default]
    Any,
    Nonfoil,
    Foil,
}

impl FinishView {
    pub fn key(self) -> &'static str {
        match self {
            Self::Any => "any",
            Self::Nonfoil => "nonfoil",
            Self::Foil => "foil",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetCatalog {
    pub today: String,
    pub sets: Vec<CardSet>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CardSet {
    pub code: String,
    pub name: String,
    pub released_at: String,
    pub icon_svg_uri: String,
    pub sections: Vec<SetSection>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetSection {
    pub position: i32,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CopyCountByFinish {
    pub owner_id: String,
    pub finish: String,
    pub quantity: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetPrinting {
    pub set_code: String,
    pub printing_id: String,
    pub name: String,
    pub collector_number: String,
    pub image_uri: Option<String>,
    pub art_crop_uri: Option<String>,
    pub finishes: Vec<String>,
    pub booster: bool,
    pub promo: bool,
    pub variation: bool,
    pub basic_land: bool,
    pub absent: bool,
    pub prices: [Option<i32>; 3],
    pub copy_counts_by_finish: Vec<CopyCountByFinish>,
    pub sections: Vec<i32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FinishValues<T> {
    pub any: T,
    pub nonfoil: T,
    pub foil: T,
}

impl<T> FinishValues<T> {
    pub fn in_view(&self, view: FinishView) -> &T {
        match view {
            FinishView::Any => &self.any,
            FinishView::Nonfoil => &self.nonfoil,
            FinishView::Foil => &self.foil,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Completion {
    pub owned: usize,
    pub size: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetCardPrinting {
    pub printing_id: String,
    pub name: String,
    pub collector_number: String,
    pub image_uri: Option<String>,
    pub finishes: Vec<String>,
    pub counts: FinishValues<Option<u64>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetGroup {
    pub name: String,
    pub completion: FinishValues<Completion>,
    pub card_printings: Vec<SetCardPrinting>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetPage {
    pub set: CardSet,
    pub set_art_uri: Option<String>,
    pub completion: FinishValues<Completion>,
    pub main_set: Vec<SetCardPrinting>,
    pub variants: SetGroup,
    pub sections: Vec<SetGroup>,
    pub other: SetGroup,
}

fn completion(printings: &[SetCardPrinting]) -> FinishValues<Completion> {
    let count = |view| Completion {
        size: printings
            .iter()
            .filter(|p| p.counts.in_view(view).is_some())
            .count(),
        owned: printings
            .iter()
            .filter(|p| p.counts.in_view(view).is_some_and(|count| count > 0))
            .count(),
    };
    FinishValues {
        any: count(FinishView::Any),
        nonfoil: count(FinishView::Nonfoil),
        foil: count(FinishView::Foil),
    }
}

fn shown(printing: &SetPrinting, owner: &str) -> SetCardPrinting {
    let copies = |finishes: &[&str]| {
        printing
            .copy_counts_by_finish
            .iter()
            .filter(|copy| {
                copy.owner_id == owner
                    && (finishes.is_empty() || finishes.contains(&copy.finish.as_str()))
            })
            .map(|copy| copy.quantity)
            .sum()
    };
    SetCardPrinting {
        printing_id: printing.printing_id.clone(),
        name: printing.name.clone(),
        collector_number: printing.collector_number.clone(),
        image_uri: printing.image_uri.clone(),
        finishes: printing.finishes.clone(),
        counts: FinishValues {
            any: Some(copies(&[])),
            nonfoil: Some(
                if printing.finishes.iter().any(|finish| finish == "nonfoil") {
                    copies(&["nonfoil"])
                } else {
                    copies(&[])
                },
            ),
            foil: printing
                .finishes
                .iter()
                .any(|finish| finish == "foil" || finish == "etched")
                .then(|| copies(&["foil", "etched"])),
        },
    }
}

fn collector_order(a: &str, b: &str) -> std::cmp::Ordering {
    let digits = |text: &str| {
        let leading = text.bytes().take_while(u8::is_ascii_digit).count();
        (leading > 0).then(|| {
            let value = text[..leading].trim_start_matches('0');
            if value.is_empty() { "0" } else { value }.to_string()
        })
    };
    match (digits(a), digits(b)) {
        (Some(a_digits), Some(b_digits)) => a_digits
            .len()
            .cmp(&b_digits.len())
            .then_with(|| a_digits.cmp(&b_digits))
            .then_with(|| a.cmp(b)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.cmp(b),
    }
}

pub fn set_page(mut set: CardSet, printings: Vec<SetPrinting>, owner: &str) -> SetPage {
    let mut printings: Vec<_> = printings
        .into_iter()
        .filter(|p| p.set_code == set.code && !p.basic_land && !p.absent)
        .collect();
    printings.sort_by(|a, b| {
        collector_order(&a.collector_number, &b.collector_number)
            .then_with(|| a.printing_id.cmp(&b.printing_id))
    });
    set.sections.sort_by_key(|section| section.position);
    let has_booster = printings.iter().any(|p| p.booster);
    let only_promos = printings.iter().all(|p| p.promo);
    let in_main = |p: &SetPrinting| {
        if has_booster {
            p.booster && !p.promo && !p.variation
        } else {
            only_promos || !p.promo
        }
    };
    let main_set: Vec<_> = printings
        .iter()
        .filter(|p| in_main(p))
        .map(|p| shown(p, owner))
        .collect();
    let variants: Vec<_> = printings
        .iter()
        .filter(|p| !in_main(p))
        .map(|p| shown(p, owner))
        .collect();
    let group = |name: &str, card_printings: Vec<SetCardPrinting>| SetGroup {
        name: name.into(),
        completion: completion(&card_printings),
        card_printings,
    };
    let sections = set
        .sections
        .iter()
        .map(|section| {
            group(
                &section.name,
                printings
                    .iter()
                    .filter(|p| p.sections.contains(&section.position))
                    .map(|p| shown(p, owner))
                    .collect(),
            )
        })
        .filter(|section| !section.card_printings.is_empty())
        .collect();
    let other = group(
        "Other cards",
        printings
            .iter()
            .filter(|p| {
                !set.sections
                    .iter()
                    .any(|section| p.sections.contains(&section.position))
            })
            .map(|p| shown(p, owner))
            .collect(),
    );
    let set_art_uri = printings
        .iter()
        .filter(|p| p.art_crop_uri.is_some())
        .min_by(|a, b| {
            b.prices
                .iter()
                .flatten()
                .max()
                .cmp(&a.prices.iter().flatten().max())
                .then_with(|| collector_order(&a.collector_number, &b.collector_number))
                .then_with(|| a.printing_id.cmp(&b.printing_id))
        })
        .and_then(|p| p.art_crop_uri.clone());
    SetPage {
        set,
        set_art_uri,
        completion: completion(&main_set),
        main_set,
        variants: group("Variants", variants),
        sections,
        other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set() -> CardSet {
        CardSet {
            code: "tst".into(),
            name: "Test set".into(),
            released_at: "2026-01-01".into(),
            icon_svg_uri: String::new(),
            sections: vec![],
        }
    }
    fn printing(id: &str, number: &str) -> SetPrinting {
        SetPrinting {
            set_code: "tst".into(),
            printing_id: id.into(),
            name: id.into(),
            collector_number: number.into(),
            image_uri: None,
            art_crop_uri: None,
            finishes: vec!["nonfoil".into()],
            booster: true,
            promo: false,
            variation: false,
            basic_land: false,
            absent: false,
            prices: [None; 3],
            copy_counts_by_finish: vec![],
            sections: vec![],
        }
    }

    #[test]
    fn main_set_excludes_basic_lands_absent_printings_promos_and_variations() {
        let regular = printing("regular", "1");
        let mut variant = printing("variant", "2");
        variant.variation = true;
        let mut promo = printing("promo", "3");
        promo.promo = true;
        let mut land = printing("land", "4");
        land.basic_land = true;
        let mut absent = printing("absent", "5");
        absent.absent = true;
        let page = set_page(set(), vec![regular, variant, promo, land, absent], "owner");
        assert_eq!(
            page.main_set
                .iter()
                .map(|p| p.printing_id.as_str())
                .collect::<Vec<_>>(),
            ["regular"]
        );
        assert_eq!(
            page.variants
                .card_printings
                .iter()
                .map(|p| p.printing_id.as_str())
                .collect::<Vec<_>>(),
            ["variant", "promo"]
        );
        let mut commander = printing("commander", "1");
        commander.booster = false;
        commander.variation = true;
        let mut promo = printing("promo", "2");
        promo.booster = false;
        promo.promo = true;
        let page = set_page(set(), vec![commander, promo.clone()], "owner");
        assert_eq!(page.main_set[0].printing_id, "commander");
        assert_eq!(page.variants.card_printings[0].printing_id, "promo");
        let page = set_page(set(), vec![promo], "owner");
        assert_eq!(page.main_set[0].printing_id, "promo");
    }

    #[test]
    fn overlapping_sections_keep_scryfall_order_and_unlisted_printings_are_other_cards() {
        let mut card_set = set();
        card_set.sections = vec![
            SetSection {
                position: 2,
                name: "Foils".into(),
            },
            SetSection {
                position: 1,
                name: "Showcases".into(),
            },
        ];
        let mut a = printing("a", "10");
        a.sections = vec![1, 2];
        let mut b = printing("b", "2b");
        b.sections = vec![1];
        let mut c = printing("c", "2");
        c.sections = vec![1];
        let other = printing("other", "★1");
        let page = set_page(card_set, vec![a, b, other, c], "owner");
        assert_eq!(
            page.sections
                .iter()
                .map(|s| s.name.as_str())
                .collect::<Vec<_>>(),
            ["Showcases", "Foils"]
        );
        assert_eq!(
            page.sections[0]
                .card_printings
                .iter()
                .map(|p| p.printing_id.as_str())
                .collect::<Vec<_>>(),
            ["c", "b", "a"]
        );
        assert_eq!(page.sections[1].card_printings[0].printing_id, "a");
        assert_eq!(page.other.card_printings[0].printing_id, "other");
        assert_eq!(page.completion.any.size, 4);
    }

    #[test]
    fn set_art_uses_highest_current_price_in_any_finish_then_collector_order() {
        let mut first = printing("first", "2");
        first.art_crop_uri = Some("first.jpg".into());
        let mut variant = printing("variant", "10");
        variant.variation = true;
        variant.art_crop_uri = Some("variant.jpg".into());
        variant.prices = [Some(5), None, Some(900)];
        let mut land = printing("land", "1");
        land.basic_land = true;
        land.art_crop_uri = Some("land.jpg".into());
        land.prices = [Some(9999), None, None];
        let mut no_art = printing("no art", "3");
        no_art.prices = [Some(99999), None, None];
        let page = set_page(
            set(),
            vec![variant.clone(), first.clone(), land, no_art],
            "owner",
        );
        assert_eq!(page.set_art_uri.as_deref(), Some("variant.jpg"));
        variant.prices = [None; 3];
        let page = set_page(set(), vec![variant, first], "owner");
        assert_eq!(page.set_art_uri.as_deref(), Some("first.jpg"));
        let page = set_page(set(), vec![printing("no art", "1")], "owner");
        assert_eq!(page.set_art_uri, None);
    }

    #[test]
    fn finish_views_keep_nonfoil_exceptions_and_foil_availability() {
        let nonfoil = printing("nonfoil-only", "1");
        let mut etched = printing("etched-only", "2");
        etched.finishes = vec!["etched".into()];
        etched.copy_counts_by_finish = vec![CopyCountByFinish {
            owner_id: "owner".into(),
            finish: "etched".into(),
            quantity: 3,
        }];
        let page = set_page(set(), vec![nonfoil, etched], "owner");
        assert_eq!(page.completion.nonfoil, Completion { owned: 1, size: 2 });
        assert_eq!(page.completion.foil, Completion { owned: 1, size: 1 });
        assert_eq!(page.main_set[0].counts.foil, None);
        assert_eq!(page.main_set[1].counts.nonfoil, Some(3));
    }
}
