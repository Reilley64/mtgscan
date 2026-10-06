import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  parseCardQuad,
  rectifiedCropJpeg,
  rectifyCard,
  RectifiedInputError,
  type CardQuad,
} from "../src/rectify.js";

const quad: CardQuad = {
  topLeft: { x: 0.2, y: 0.15 },
  topRight: { x: 0.75, y: 0.2 },
  bottomRight: { x: 0.8, y: 0.85 },
  bottomLeft: { x: 0.15, y: 0.8 },
};
const markers = [
  { corner: "topLeft", opposite: "bottomRight", color: [255, 0, 0] },
  { corner: "topRight", opposite: "bottomLeft", color: [0, 255, 0] },
  { corner: "bottomRight", opposite: "topLeft", color: [0, 0, 255] },
  { corner: "bottomLeft", opposite: "topRight", color: [255, 255, 0] },
] as const;
const width = 1200,
  height = 900;

async function photoWithCard() {
  const points = Object.values(quad)
    .map((point) => `${point.x * width},${point.y * height}`)
    .join(" ");
  const circles = markers
    .map(({ corner, opposite, color }) => {
      const x = quad[corner].x + (quad[opposite].x - quad[corner].x) * 0.12;
      const y = quad[corner].y + (quad[opposite].y - quad[corner].y) * 0.12;
      return `<circle cx="${x * width}" cy="${y * height}" r="28" fill="rgb(${color.join(",")})"/>`;
    })
    .join("");
  return sharp(
    Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" fill="#404040"/><polygon points="${points}" fill="#ffffff"/>${circles}</svg>`,
    ),
  )
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function cornerColors(crop: Buffer) {
  const { data, info } = await sharp(crop)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => {
    const offset = (Math.round(y) * info.width + Math.round(x)) * info.channels;
    return [data[offset]!, data[offset + 1]!, data[offset + 2]!];
  };
  return {
    size: [info.width, info.height],
    topLeft: at(0.12 * info.width, 0.12 * info.height),
    topRight: at(0.88 * info.width, 0.12 * info.height),
    bottomRight: at(0.88 * info.width, 0.88 * info.height),
    bottomLeft: at(0.12 * info.width, 0.88 * info.height),
    center: at(0.5 * info.width, 0.5 * info.height),
    outside: at(2, 2),
  };
}

function expectColor(actual: number[], expected: readonly number[]) {
  actual.forEach((value, index) =>
    expect(Math.abs(value - expected[index]!)).toBeLessThan(40),
  );
}

describe("card quad validation", () => {
  const header = (value: unknown) => JSON.stringify(value);

  it("accepts a clockwise convex quad and clamps tiny overshoot", () => {
    const parsed = parseCardQuad(
      header({ ...quad, topLeft: { x: -0.0005, y: 0.15 } }),
    );
    expect(parsed.topLeft).toEqual({ x: 0, y: 0.15 });
    expect(parsed.bottomRight).toEqual(quad.bottomRight);
  });

  it.each([
    ["missing header", undefined],
    ["non-JSON", "corners"],
    ["array", header([1, 2, 3, 4])],
    ["missing corner", header({ ...quad, bottomLeft: undefined })],
    ["extra key", header({ ...quad, center: { x: 0.5, y: 0.5 } })],
    ["string coordinate", header({ ...quad, topLeft: { x: "0.2", y: 0.1 } })],
    [
      "non-finite coordinate",
      '{"topLeft":{"x":1e999,"y":0.1},"topRight":{"x":0.7,"y":0.2},"bottomRight":{"x":0.8,"y":0.8},"bottomLeft":{"x":0.1,"y":0.8}}',
    ],
    [
      "outside the photo",
      header({ ...quad, bottomRight: { x: 1.002, y: 0.85 } }),
    ],
    [
      "self-intersecting",
      header({
        ...quad,
        bottomRight: quad.bottomLeft,
        bottomLeft: quad.bottomRight,
      }),
    ],
    [
      "counter-clockwise",
      header({
        topLeft: quad.topLeft,
        topRight: quad.bottomLeft,
        bottomRight: quad.bottomRight,
        bottomLeft: quad.topRight,
      }),
    ],
    ["concave", header({ ...quad, bottomRight: { x: 0.4, y: 0.4 } })],
    [
      "too small",
      header({
        topLeft: { x: 0.5, y: 0.5 },
        topRight: { x: 0.55, y: 0.5 },
        bottomRight: { x: 0.55, y: 0.57 },
        bottomLeft: { x: 0.5, y: 0.57 },
      }),
    ],
  ])("rejects a %s quad", (_label, value) => {
    expect(() => parseCardQuad(value)).toThrow(RectifiedInputError);
  });
});

describe("card rectification", () => {
  it("warps the quad to an upright card raster with each corner in place", async () => {
    const image = await rectifyCard(await photoWithCard(), quad);
    expect(image.card).toEqual({
      left: Math.round(CARD_WIDTH * 0.1),
      top: Math.round(CARD_HEIGHT * 0.1),
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    });
    const colors = await cornerColors(await rectifiedCropJpeg(image));
    expect(colors.size).toEqual([CARD_WIDTH, CARD_HEIGHT]);
    for (const { corner, color } of markers) expectColor(colors[corner], color);
    expectColor(colors.center, [255, 255, 255]);
    expectColor(colors.outside, [255, 255, 255]);
  });

  it("reads the quad in the displayed orientation of an EXIF-rotated photo", async () => {
    const displayed = await photoWithCard();
    const stored = await sharp(displayed)
      .rotate(-90)
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 95 })
      .toBuffer();
    expect((await sharp(stored).metadata()).orientation).toBe(6);
    const colors = await cornerColors(
      await rectifiedCropJpeg(await rectifyCard(stored, quad)),
    );
    for (const { corner, color } of markers) expectColor(colors[corner], color);
  });

  it("rejects bytes that are not a decodable photo", async () => {
    await expect(
      rectifyCard(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), quad),
    ).rejects.toThrow(RectifiedInputError);
  });
});
