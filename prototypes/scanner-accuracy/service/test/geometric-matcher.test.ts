import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  decideGeometricAcceptance,
  finiteConvexQuad,
  verifiedInlierSupport,
} from "../src/geometric-decision.js";
type GeometricCandidate = {
  card: CorpusCard;
  support: number;
  acceptedFrames: number;
  frames: Array<{
    keypoints: number;
    goodMatches: number;
    inliers: number;
    inlierRatio: number;
    homographyValid: boolean;
    quadValid: boolean;
    areaFraction: number;
  }>;
};
import {
  clearGeometricReferenceCache,
  rerankGeometrically,
} from "../src/geometric-matcher.js";
import type { CorpusCard } from "../src/ranking.js";
const card = (id: string): CorpusCard => ({
  scryfallId: id,
  oracleId: "oracle",
  name: "Same Name",
  set: "tst",
  collectorNumber: id,
  language: "en",
  finishes: ["nonfoil"],
  imageHash: "00",
});
const diagnostic = (inliers: number, valid = true) => ({
  keypoints: 100,
  goodMatches: 50,
  inliers,
  inlierRatio: inliers / 50,
  homographyValid: valid,
  quadValid: valid,
  areaFraction: valid ? 0.4 : 0,
});
const candidate = (
  id: string,
  support: number,
  acceptedFrames: number,
): GeometricCandidate => ({
  card: card(id),
  support,
  acceptedFrames,
  frames: [
    diagnostic(Math.floor(support / 2)),
    diagnostic(Math.ceil(support / 2)),
    diagnostic(1, false),
  ],
});
async function patternedCard(label: string) {
  const lines = Array.from(
    { length: 24 },
    (_, i) =>
      `<path d="M${(i * 37) % 630} 0 L${630 - ((i * 19) % 630)} 880" stroke="#${((i * 712345) % 0xffffff).toString(16).padStart(6, "0")}" stroke-width="${2 + (i % 5)}"/>`,
  ).join("");
  return sharp(
    Buffer.from(
      `<svg width="630" height="880" xmlns="http://www.w3.org/2000/svg"><rect width="630" height="880" fill="#e8d4a0"/>${lines}<text x="35" y="120" font-size="72" font-family="serif">${label}</text><text x="50" y="700" font-size="40">0123456789 ${label}</text></svg>`,
    ),
  )
    .jpeg({ quality: 95 })
    .toBuffer();
}
describe("OpenCV geometric matcher", () => {
  it("reranks patterned same-name references, abstains blank frames, and survives a second call", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "geometric-"));
    const right = card("right"),
      wrong = card("wrong");
    try {
      await fs.writeFile(
        path.join(root, "right.jpg"),
        await patternedCard("RIGHT"),
      );
      await fs.writeFile(
        path.join(root, "wrong.jpg"),
        await patternedCard("WRONG"),
      );
      const still = await patternedCard("RIGHT");
      const result = await rerankGeometrically(
        [still, still, still],
        [wrong, right],
        { referenceRoot: root },
      );
      expect(result.candidates[0]?.card.scryfallId).toBe("right");
      expect(result.acceptedScryfallId).toBe("right");
      const blank = await sharp({
        create: { width: 630, height: 880, channels: 3, background: "white" },
      })
        .jpeg()
        .toBuffer();
      expect(
        (
          await rerankGeometrically([blank, blank, blank], [wrong, right], {
            referenceRoot: root,
          })
        ).acceptedScryfallId,
      ).toBeNull();
      expect(
        (
          await rerankGeometrically([still, still, still], [wrong, right], {
            referenceRoot: root,
          })
        ).acceptedScryfallId,
      ).toBe("right");
    } finally {
      clearGeometricReferenceCache();
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("isolated geometric acceptance gates", () => {
  it("uses two strongest generated-frame supports to rerank same-name printings", async () => {
    const generatedStill = await sharp({
      create: {
        width: 64,
        height: 96,
        channels: 3,
        background: { r: 32, g: 64, b: 128 },
      },
    })
      .jpeg()
      .toBuffer();
    expect(generatedStill.subarray(0, 3)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );
    const result = decideGeometricAcceptance([
      candidate("wrong", 60, 2),
      candidate("right", 140, 2),
    ]);
    expect(result.acceptedScryfallId).toBe("right");
    expect(result.candidates.map((item) => item.card.scryfallId)).toEqual([
      "right",
      "wrong",
    ]);
  });
  it("abstains for blank or weak frames and for a too-small support margin", () => {
    expect(
      decideGeometricAcceptance([candidate("only", 200, 1)]).acceptedScryfallId,
    ).toBeNull();
    expect(
      decideGeometricAcceptance([candidate("a", 120, 2), candidate("b", 80, 2)])
        .acceptedScryfallId,
    ).toBeNull();
  });
  it("does not let invalid high-inlier frames create ranking support", () => {
    const frames = [
      diagnostic(400, false),
      diagnostic(100, false),
      diagnostic(61),
    ];
    expect(verifiedInlierSupport(frames)).toEqual({
      support: 61,
      acceptedFrames: 1,
    });
    const invalid = {
      ...candidate("invalid", 500, 2),
      frames,
      ...verifiedInlierSupport(frames),
    };
    const valid = candidate("valid", 120, 2);
    expect(decideGeometricAcceptance([invalid, valid]).acceptedScryfallId).toBe(
      "valid",
    );
  });
  it("rejects non-convex, non-finite, and implausibly small projected quads", () => {
    expect(finiteConvexQuad([0, 0, 10, 10, 0, 10, 10, 0], 100, 100).valid).toBe(
      false,
    );
    expect(
      finiteConvexQuad([0, 0, Infinity, 0, 10, 10, 0, 10], 100, 100).valid,
    ).toBe(false);
    expect(finiteConvexQuad([0, 0, 10, 0, 10, 10, 0, 10], 100, 100).valid).toBe(
      false,
    );
  });
});
