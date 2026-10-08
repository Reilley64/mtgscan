import { describe, expect, it } from "vitest";
import {
  batchReducer,
  initialBatchState,
  mergeStacks,
  type BatchAction,
  type Printing,
} from "../src/batch/batch";

const printing = (
  scryfallId: string,
  set = "eld",
  collectorNumber = "8",
): Printing => ({
  scryfallId,
  oracleId: `oracle-${scryfallId}`,
  name: `Card ${scryfallId}`,
  set,
  collectorNumber,
});

const recognized = (
  sequence: number,
  candidates: Printing[],
  extra: Partial<Extract<BatchAction, { type: "recognized" }>> = {},
): BatchAction => ({
  type: "recognized",
  scanId: `scan-${sequence}`,
  sequence,
  candidates,
  premiumMark: false,
  notACard: false,
  ...extra,
});

describe("scan batch", () => {
  it("shows the most likely printing for every scan, keeps the other options, and skips non-cards", () => {
    let state = batchReducer(
      initialBatchState,
      recognized(1, [printing("a"), printing("b")]),
    );
    state = batchReducer(
      state,
      recognized(2, [printing("c")], { notACard: true }),
    );
    state = batchReducer(state, recognized(1, [printing("z")]));
    expect(state.scans).toHaveLength(1);
    expect(state.scans[0]).toMatchObject({
      printing: { scryfallId: "a" },
      options: [{ scryfallId: "a" }, { scryfallId: "b" }],
      finish: "nonfoil",
      condition: "NM",
      language: "en",
    });
  });

  it("defaults the finish to foil when the collector line shows the premium star", () => {
    const state = batchReducer(
      initialBatchState,
      recognized(1, [printing("a")], { premiumMark: true }),
    );
    expect(state.scans[0]?.finish).toBe("foil");
  });

  it("switches to another option or a searched printing and edits details", () => {
    let state = batchReducer(
      initialBatchState,
      recognized(1, [printing("a"), printing("b")]),
    );
    state = batchReducer(state, {
      type: "choose",
      scanId: "scan-1",
      printing: printing("b"),
      source: "scan",
    });
    expect(state.scans[0]?.printing?.scryfallId).toBe("b");
    state = batchReducer(state, {
      type: "choose",
      scanId: "scan-1",
      printing: printing("x"),
      source: "search",
    });
    state = batchReducer(state, {
      type: "setCondition",
      scanId: "scan-1",
      condition: "LP",
    });
    state = batchReducer(state, {
      type: "setLanguage",
      scanId: "scan-1",
      language: "ja",
    });
    state = batchReducer(state, {
      type: "setFinish",
      scanId: "scan-1",
      finish: "etched",
    });
    expect(state.scans[0]).toMatchObject({
      printing: { scryfallId: "x" },
      source: "search",
      condition: "LP",
      language: "ja",
      finish: "etched",
    });
  });

  it("applies new defaults to later scans only", () => {
    let state = batchReducer(initialBatchState, recognized(1, [printing("a")]));
    state = batchReducer(state, {
      type: "setDefaults",
      defaults: { condition: "LP" },
    });
    state = batchReducer(state, recognized(2, [printing("b")]));
    expect(state.scans.map((scan) => scan.condition)).toEqual(["NM", "LP"]);
  });

  it("keeps a failed scan without a printing until it is searched or removed", () => {
    let state = batchReducer(initialBatchState, {
      type: "failed",
      scanId: "scan-1",
      sequence: 1,
    });
    state = batchReducer(state, recognized(2, [printing("a")]));
    state = batchReducer(state, { type: "commit" });
    expect(state.scans.map((scan) => scan.scanId)).toEqual(["scan-1"]);
    expect(state.collection).toHaveLength(1);
    state = batchReducer(state, { type: "remove", scanId: "scan-1" });
    expect(state.scans).toEqual([]);
  });

  it("merges identical copies into one stack and keeps different details apart", () => {
    let state = initialBatchState;
    state = batchReducer(state, recognized(1, [printing("a")]));
    state = batchReducer(state, recognized(2, [printing("a")]));
    state = batchReducer(
      state,
      recognized(3, [printing("a")], { premiumMark: true }),
    );
    state = batchReducer(state, { type: "commit" });
    state = batchReducer(state, recognized(4, [printing("a")]));
    state = batchReducer(state, { type: "commit" });
    expect(
      state.collection.map((stack) => [
        stack.printing.scryfallId,
        stack.finish,
        stack.quantity,
      ]),
    ).toEqual([
      ["a", "nonfoil", 3],
      ["a", "foil", 1],
    ]);
    expect(mergeStacks([], [])).toEqual([]);
  });
});
