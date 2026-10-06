import { describe, expect, it } from "vitest";
import {
  decideRectifiedAcceptance,
  MIN_INLIERS,
} from "../src/rectified-decision.js";

const cells = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, index) => from + index);
const candidate = (
  scryfallId: string,
  inliers: number,
  inlierCells: number[],
  plausible = true,
  appearance = scryfallId === "right" ? 4 : 2,
) => ({ scryfallId, inliers, plausible, inlierCells, appearance });

describe("rectified acceptance decision", () => {
  it("accepts when the art supports only the top printing", () => {
    expect(
      decideRectifiedAcceptance([
        candidate("right", 150, cells(0, 60)),
        candidate("same-frame", 120, [...cells(0, 30), ...cells(100, 104)]),
        candidate("other-name", 40, cells(200, 230), false),
      ]),
    ).toEqual({ accepted: true, scryfallId: "right", reasons: [] });
  });

  it("abstains when a reprint is supported by the same regions", () => {
    const decision = decideRectifiedAcceptance([
      candidate("right", 150, cells(0, 60)),
      candidate("reprint", 145, cells(2, 60)),
    ]);
    expect(decision.accepted).toBe(false);
    expect(decision.scryfallId).toBeNull();
    expect(decision.reasons.join()).toContain("printing reprint is too close");
  });

  it("abstains when a rival has its own distinct support", () => {
    const decision = decideRectifiedAcceptance([
      candidate("right", 150, cells(0, 60)),
      candidate("rival", 100, [...cells(0, 30), ...cells(100, 120)]),
    ]);
    expect(decision.accepted).toBe(false);
  });

  it("abstains when the verified printing does not also lead on appearance", () => {
    const decision = decideRectifiedAcceptance([
      candidate("right", 150, cells(0, 60), true, 3.4),
      candidate("same-frame", 60, cells(0, 20), true, 2.6),
    ]);
    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toEqual([
      "appearance does not single out the top candidate: 3.40 against 2.60",
    ]);
  });

  it("abstains when a printing with the same art was not compared", () => {
    const decision = decideRectifiedAcceptance(
      [candidate("right", 150, cells(0, 60))],
      1,
    );
    expect(decision.accepted).toBe(false);
    expect(decision.reasons).toEqual([
      "1 other printings with the same art were not compared",
    ]);
  });

  it("abstains when the top match is weak", () => {
    const decision = decideRectifiedAcceptance([
      candidate("right", MIN_INLIERS - 1, cells(0, 20)),
    ]);
    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join()).toContain("RANSAC inliers");
  });

  it("does not count an implausible homography", () => {
    expect(
      decideRectifiedAcceptance([
        candidate("warped", 200, cells(0, 80), false),
        candidate("other", 0, []),
      ]),
    ).toEqual({
      accepted: false,
      scryfallId: null,
      reasons: ["no candidate has a plausible card homography"],
    });
  });

  it("abstains without candidates", () => {
    expect(decideRectifiedAcceptance([]).accepted).toBe(false);
  });
});
