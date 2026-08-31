import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { differenceHash, hashSimilarity } from "../src/image-distance.js";
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
