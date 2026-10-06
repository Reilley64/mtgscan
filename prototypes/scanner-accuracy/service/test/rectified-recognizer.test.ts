import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import {
  loadRectifiedCorpus,
  printingImageRoot,
  printingRoot,
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

const beanstalkOriginal = "49875f7a-31b9-4276-b971-8ead1e18fc81";
const beanstalkOnTheList = "035975da-7a65-4cef-9bd3-d1e1f6102f38";
const printingPrepared =
  prepared &&
  fs.existsSync(path.join(printingRoot, "index.json")) &&
  [beanstalkOriginal, beanstalkOnTheList].every((id) =>
    fs.existsSync(path.join(printingImageRoot, `${id}.png`)),
  );

describe.skipIf(!printingPrepared)("high-resolution printing check", () => {
  const runner = createRectifiedRerankRunner({
    featureRoot: rectifiedRoot,
    maxReranksPerWorker: 50,
    timeoutMs: 10_000,
    workers: 2,
  });
  afterAll(() => runner.close());

  it.each([
    ["The List stamp", beanstalkOnTheList],
    ["original printing", beanstalkOriginal],
  ])(
    "tells the %s apart from a same-art reprint in a full-size photo",
    async (_label, scryfallId) => {
      const card = await sharp(
        path.join(printingImageRoot, `${scryfallId}.png`),
      )
        .resize(1490, 2080)
        .flatten({ background: "#5a6070" })
        .toBuffer();
      const photo = await sharp({
        create: {
          width: 2376,
          height: 3168,
          channels: 3,
          background: "#5a6070",
        },
      })
        .composite([{ input: card, left: 443, top: 544 }])
        .jpeg({ quality: 90 })
        .toBuffer();
      const { recognition } = await recognizeRectified(
        {
          scanId: `printing-${scryfallId}`,
          photo,
          quad: {
            topLeft: { x: 443 / 2376, y: 544 / 3168 },
            topRight: { x: 1933 / 2376, y: 544 / 3168 },
            bottomRight: { x: 1933 / 2376, y: 2624 / 3168 },
            bottomLeft: { x: 443 / 2376, y: 2624 / 3168 },
          },
        },
        await loadRectifiedCorpus(),
        runner,
      );
      expect(recognition.printingCheck?.chosen).toBe(scryfallId);
      expect(recognition.candidates[0]!.scryfallId).toBe(scryfallId);
      expect(recognition.decision.scryfallId).toBe(scryfallId);
    },
    60_000,
  );
});
