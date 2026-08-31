import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  differenceHash,
  hashSimilarity,
  normalizedCard,
} from "../src/image-distance.js";
describe("deterministic image distance", () => {
  it("normalizes a centered card crop and gives identical images maximum similarity", async () => {
    const image = await sharp({
      create: { width: 630, height: 1000, channels: 3, background: "white" },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 500,
              height: 700,
              channels: 3,
              background: "black",
            },
          })
            .png()
            .toBuffer(),
          left: 65,
          top: 150,
        },
      ])
      .jpeg()
      .toBuffer();
    const hash = await differenceHash(image);
    expect(hashSimilarity(hash, hash)).toBe(1);
  });
});
it("applies EXIF orientation before dimensions and crop", async () => {
  const image = await sharp({
    create: { width: 880, height: 630, channels: 3, background: "red" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const normalized = await normalizedCard(image);
  const metadata = await sharp(normalized).metadata();
  expect(metadata.height! / metadata.width!).toBeCloseTo(88 / 63, 1);
});
