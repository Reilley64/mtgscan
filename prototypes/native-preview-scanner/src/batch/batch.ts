export type Finish = "nonfoil" | "foil" | "etched";
export type Condition = "NM" | "LP" | "MP" | "HP" | "DMG";

export const FINISHES: readonly Finish[] = ["nonfoil", "foil", "etched"];
export const CONDITIONS: readonly Condition[] = ["NM", "LP", "MP", "HP", "DMG"];
export const LANGUAGES: readonly string[] = [
  "en",
  "ja",
  "de",
  "fr",
  "it",
  "es",
  "pt",
  "ko",
  "ru",
  "zhs",
  "zht",
];

export type Printing = Readonly<{
  scryfallId: string;
  oracleId: string;
  name: string;
  set: string;
  collectorNumber: string;
}>;

export type BatchScan = Readonly<{
  scanId: string;
  sequence: number;
  options: readonly Printing[];
  printing: Printing | null;
  finish: Finish;
  condition: Condition;
  language: string;
  source: "scan" | "search";
}>;

export type BatchDefaults = Readonly<{
  condition: Condition;
  language: string;
}>;

export type CollectionStack = Readonly<{
  printing: Printing;
  finish: Finish;
  condition: Condition;
  language: string;
  quantity: number;
}>;

export type BatchState = Readonly<{
  scans: readonly BatchScan[];
  defaults: BatchDefaults;
  collection: readonly CollectionStack[];
}>;

export type BatchAction =
  | {
      type: "recognized";
      scanId: string;
      sequence: number;
      candidates: readonly Printing[];
      premiumMark: boolean;
      notACard: boolean;
    }
  | { type: "failed"; scanId: string; sequence: number }
  | {
      type: "choose";
      scanId: string;
      printing: Printing;
      source: "scan" | "search";
    }
  | { type: "setFinish"; scanId: string; finish: Finish }
  | { type: "setCondition"; scanId: string; condition: Condition }
  | { type: "setLanguage"; scanId: string; language: string }
  | { type: "remove"; scanId: string }
  | { type: "setDefaults"; defaults: Partial<BatchDefaults> }
  | { type: "commit" };

export const initialBatchState: BatchState = {
  scans: [],
  defaults: { condition: "NM", language: "en" },
  collection: [],
};

function updateScan(
  state: BatchState,
  scanId: string,
  change: (scan: BatchScan) => BatchScan,
): BatchState {
  return {
    ...state,
    scans: state.scans.map((scan) =>
      scan.scanId === scanId ? change(scan) : scan,
    ),
  };
}

function stackKey(stack: Omit<CollectionStack, "quantity">) {
  return [
    stack.printing.scryfallId,
    stack.finish,
    stack.condition,
    stack.language,
  ].join("|");
}

export function mergeStacks(
  existing: readonly CollectionStack[],
  scans: readonly BatchScan[],
): CollectionStack[] {
  const merged = new Map<string, CollectionStack>();
  for (const stack of existing) merged.set(stackKey(stack), stack);
  for (const scan of scans) {
    if (scan.printing === null) continue;
    const entry = {
      printing: scan.printing,
      finish: scan.finish,
      condition: scan.condition,
      language: scan.language,
    };
    const key = stackKey(entry);
    const current = merged.get(key);
    merged.set(key, { ...entry, quantity: (current?.quantity ?? 0) + 1 });
  }
  return [...merged.values()];
}

export function batchReducer(
  state: BatchState,
  action: BatchAction,
): BatchState {
  switch (action.type) {
    case "recognized": {
      if (
        action.notACard ||
        state.scans.some((scan) => scan.scanId === action.scanId)
      )
        return state;
      return {
        ...state,
        scans: [
          ...state.scans,
          {
            scanId: action.scanId,
            sequence: action.sequence,
            options: action.candidates,
            printing: action.candidates[0] ?? null,
            finish: action.premiumMark ? "foil" : "nonfoil",
            condition: state.defaults.condition,
            language: state.defaults.language,
            source: "scan",
          },
        ],
      };
    }
    case "failed":
      if (state.scans.some((scan) => scan.scanId === action.scanId))
        return state;
      return {
        ...state,
        scans: [
          ...state.scans,
          {
            scanId: action.scanId,
            sequence: action.sequence,
            options: [],
            printing: null,
            finish: "nonfoil",
            condition: state.defaults.condition,
            language: state.defaults.language,
            source: "scan",
          },
        ],
      };
    case "choose":
      return updateScan(state, action.scanId, (scan) => ({
        ...scan,
        printing: action.printing,
        source: action.source,
      }));
    case "setFinish":
      return updateScan(state, action.scanId, (scan) => ({
        ...scan,
        finish: action.finish,
      }));
    case "setCondition":
      return updateScan(state, action.scanId, (scan) => ({
        ...scan,
        condition: action.condition,
      }));
    case "setLanguage":
      return updateScan(state, action.scanId, (scan) => ({
        ...scan,
        language: action.language,
      }));
    case "remove":
      return {
        ...state,
        scans: state.scans.filter((scan) => scan.scanId !== action.scanId),
      };
    case "setDefaults":
      return { ...state, defaults: { ...state.defaults, ...action.defaults } };
    case "commit":
      return {
        ...state,
        scans: state.scans.filter((scan) => scan.printing === null),
        collection: mergeStacks(state.collection, state.scans),
      };
  }
}
