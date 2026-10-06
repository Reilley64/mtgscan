import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import {
  loadRectifiedCorpus,
  rectifiedRoot,
  referenceImageRoot,
} from "../src/rectified-corpus.js";
import { recognizeRectified } from "../src/rectified-recognizer.js";
import { createRectifiedRerankRunner } from "../src/rectified-rerank-runner.js";

const akroanMastiff = "7e21938b-46b1-4b2f-8269-0cd0e998cddc";
const reference = path.join(referenceImageRoot, `${akroanMastiff}.jpg`);
const prepared =
  fs.existsSync(path.join(rectifiedRoot, "corpus.json")) &&
  fs.existsSync(reference);
const wholePhoto = {
  topLeft: { x: 0.0005, y: 0.0005 },
  topRight: { x: 0.9995, y: 0.0005 },
  bottomRight: { x: 0.9995, y: 0.9995 },
  bottomLeft: { x: 0.0005, y: 0.9995 },
};

describe.skipIf(!prepared)("rectified recognition of a turned card", () => {
  const runner = createRectifiedRerankRunner({
    featureRoot: rectifiedRoot,
    maxReranksPerWorker: 50,
    timeoutMs: 10_000,
    workers: 2,
  });
  afterAll(() => runner.close());

  it.each([0, 90, 180, 270])(
    "recognizes a reference photo turned %i degrees like the upright one",
    async (degrees) => {
      const corpus = await loadRectifiedCorpus();
      const photo = await sharp(fs.readFileSync(reference))
        .rotate(degrees)
        .jpeg({ quality: 95 })
        .toBuffer();
      const { recognition } = await recognizeRectified(
        { scanId: `turned-${degrees}`, photo, quad: wholePhoto },
        corpus,
        runner,
      );
      expect(recognition.decision).toEqual({
        accepted: true,
        scryfallId: akroanMastiff,
        reasons: [],
      });
      expect(recognition.rotation).toBe((360 - degrees) % 360);
    },
    60_000,
  );
});
