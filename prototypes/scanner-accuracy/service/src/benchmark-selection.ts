import type {
  BenchmarkManifest,
  BenchmarkManifestEntry,
  Finish,
} from "@scanner-accuracy/shared";

export type OwnedVariant = {
  name: string;
  scryfallId: string;
  language: string;
  finish: Finish;
  quantity: number;
};
export type ScryfallSelectionCard = {
  id: string;
  oracle_id?: string;
  name: string;
  set: string;
  collector_number: string;
  lang: string;
  released_at?: string;
  frame?: string;
  frame_effects?: string[];
  promo?: boolean;
  variation?: boolean;
  border_color?: string;
  layout?: string;
};
type Category =
  | "same-name printings"
  | "foil/nonfoil pairs"
  | "old-frame or pre-M15 proxies"
  | "alternate/special treatments"
  | "unusual collector numbers"
  | "non-English"
  | "double-faced layouts"
  | "ordinary controls";
export type SelectionReport = {
  requestedSize: number;
  selectedSize: number;
  categories: Record<
    Category,
    { requested: number; available: number; selected: number; gap: number }
  >;
};

export function selectOwnedBenchmark(
  owned: OwnedVariant[],
  metadata: ScryfallSelectionCard[],
  requestedSize: number,
): { manifest: BenchmarkManifest; report: SelectionReport } {
  const cardById = new Map(metadata.map((card) => [card.id, card]));
  const variants = owned
    .filter((row) => row.quantity > 0 && cardById.has(row.scryfallId))
    .sort((a, b) =>
      `${a.name}|${a.scryfallId}|${a.finish}|${a.language}`.localeCompare(
        `${b.name}|${b.scryfallId}|${b.finish}|${b.language}`,
      ),
    );
  const byOracle = new Map<string, OwnedVariant[]>();
  for (const variant of variants) {
    const card = cardById.get(variant.scryfallId)!;
    const key = card.oracle_id ?? card.name;
    const group = byOracle.get(key) ?? [];
    group.push(variant);
    byOracle.set(key, group);
  }
  const sameName = [...byOracle.values()]
    .filter((group) => new Set(group.map((item) => item.scryfallId)).size > 1)
    .flatMap((group) => group);
  const byPrinting = new Map<string, OwnedVariant[]>();
  for (const variant of variants) {
    const group = byPrinting.get(variant.scryfallId) ?? [];
    group.push(variant);
    byPrinting.set(variant.scryfallId, group);
  }
  const finishPairs = [...byPrinting.values()]
    .filter((group) => new Set(group.map((item) => item.finish)).size > 1)
    .flatMap((group) => group);
  const cardFor = (variant: OwnedVariant) => cardById.get(variant.scryfallId)!;
  const pools: Record<Category, OwnedVariant[]> = {
    "same-name printings": sameName,
    "foil/nonfoil pairs": finishPairs,
    "old-frame or pre-M15 proxies": variants.filter(
      (item) =>
        cardFor(item).frame === "1993" ||
        cardFor(item).frame_effects?.includes("oldframe") ||
        (cardFor(item).released_at !== undefined &&
          cardFor(item).released_at! < "2014-07-18"),
    ),
    "alternate/special treatments": variants.filter((item) => {
      const card = cardFor(item);
      return Boolean(
        card.promo ||
        card.variation ||
        (card.border_color && card.border_color !== "black") ||
        card.frame_effects?.some((effect) =>
          ["showcase", "extendedart", "inverted", "fullart", "etched"].includes(
            effect,
          ),
        ),
      );
    }),
    "unusual collector numbers": variants.filter(
      (item) => !/^\d+$/.test(cardFor(item).collector_number),
    ),
    "non-English": variants.filter((item) => item.language !== "en"),
    "double-faced layouts": variants.filter((item) =>
      [
        "transform",
        "modal_dfc",
        "double_faced_token",
        "reversible_card",
      ].includes(cardFor(item).layout ?? ""),
    ),
    "ordinary controls": variants,
  };
  const targets: Record<Category, number> = {
    "same-name printings": 12,
    "foil/nonfoil pairs": 6,
    "old-frame or pre-M15 proxies": 5,
    "alternate/special treatments": 5,
    "unusual collector numbers": 3,
    "non-English": 3,
    "double-faced layouts": 4,
    "ordinary controls": requestedSize,
  };
  const chosen: OwnedVariant[] = [];
  const chosenKeys = new Set<string>();
  const categorySelected = new Map<Category, number>();
  const keyOf = (item: OwnedVariant) =>
    `${item.scryfallId}|${item.language}|${item.finish}`;
  const choose = (category: Category, maximum: number) => {
    let count = 0;
    for (const item of pools[category]) {
      if (
        chosen.length >= requestedSize ||
        count >= maximum ||
        chosenKeys.has(keyOf(item))
      )
        continue;
      chosen.push(item);
      chosenKeys.add(keyOf(item));
      count++;
    }
    categorySelected.set(category, count);
  };
  for (const category of Object.keys(pools) as Category[])
    if (category !== "ordinary controls") choose(category, targets[category]);
  choose("ordinary controls", requestedSize - chosen.length);
  const entries: BenchmarkManifestEntry[] = chosen.map((variant, index) => {
    const card = cardFor(variant);
    return {
      id: `owned-${String(index + 1).padStart(3, "0")}`,
      name: card.name,
      scryfallId: card.id,
      set: card.set,
      collectorNumber: card.collector_number,
      language: variant.language || card.lang,
      groundTruthFinish: variant.finish,
    };
  });
  const categories = Object.fromEntries(
    (Object.keys(pools) as Category[]).map((category) => {
      const available = new Set(pools[category].map(keyOf)).size;
      const requested =
        category === "ordinary controls"
          ? Math.max(
              0,
              requestedSize -
                entries.length +
                (categorySelected.get(category) ?? 0),
            )
          : targets[category];
      const selected = categorySelected.get(category) ?? 0;
      return [
        category,
        {
          requested,
          available,
          selected,
          gap: Math.max(0, requested - selected),
        },
      ];
    }),
  ) as SelectionReport["categories"];
  return {
    manifest: {
      name: "personal-owned-card-benchmark",
      description:
        "Generated locally from owned ManaBox rows. Contains only recognition-relevant printing, language, and finish fields.",
      entries,
    },
    report: { requestedSize, selectedSize: entries.length, categories },
  };
}
