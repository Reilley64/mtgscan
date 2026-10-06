import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  parseCardQuad,
  rectifiedCropJpeg,
  rectifyCard,
  RectifiedInputError,
  rotateHalfTurn,
  type CardQuad,
} from "../src/rectify.js";

const quad: CardQuad = {
  topLeft: { x: 0.35, y: 0.1 },
  topRight: { x: 0.65, y: 0.13 },
  bottomRight: { x: 0.68, y: 0.88 },
  bottomLeft: { x: 0.32, y: 0.85 },
};
const markers = [
  { corner: "topLeft", opposite: "bottomRight", color: [255, 0, 0] },
  { corner: "topRight", opposite: "bottomLeft", color: [0, 255, 0] },
  { corner: "bottomRight", opposite: "topLeft", color: [0, 0, 255] },
  { corner: "bottomLeft", opposite: "topRight", color: [255, 255, 0] },
] as const;
const width = 1200,
  height = 900;

async function photoWithCard(card: CardQuad = quad) {
  const points = Object.values(card)
    .map((point) => `${point.x * width},${point.y * height}`)
    .join(" ");
  const circles = markers
    .map(({ corner, opposite, color }) => {
      const x = card[corner].x + (card[opposite].x - card[corner].x) * 0.12;
      const y = card[corner].y + (card[opposite].y - card[corner].y) * 0.12;
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

  const pointingLeft: CardQuad = {
    topLeft: { x: 0.25, y: 0.75 },
    topRight: { x: 0.25, y: 0.25 },
    bottomRight: { x: 0.8, y: 0.25 },
    bottomLeft: { x: 0.8, y: 0.75 },
  };
  const pointingRight: CardQuad = {
    topLeft: { x: 0.8, y: 0.25 },
    topRight: { x: 0.8, y: 0.75 },
    bottomRight: { x: 0.25, y: 0.75 },
    bottomLeft: { x: 0.25, y: 0.25 },
  };
  const asSent = (card: CardQuad): CardQuad => {
    const corners = Object.values(card);
    const first = corners.reduce(
      (best, point, index) =>
        Math.hypot(point.x, point.y) <
        Math.hypot(corners[best]!.x, corners[best]!.y)
          ? index
          : best,
      0,
    );
    const [topLeft, topRight, bottomRight, bottomLeft] = [0, 1, 2, 3].map(
      (offset) => corners[(first + offset) % 4]!,
    );
    return { topLeft, topRight, bottomRight, bottomLeft } as CardQuad;
  };

  it("turns a sideways card so a short edge is on top", async () => {
    const image = await rectifyCard(
      await photoWithCard(pointingLeft),
      asSent(pointingLeft),
    );
    expect(image.rotation).toBe(90);
    const colors = await cornerColors(await rectifiedCropJpeg(image));
    expect(colors.size).toEqual([CARD_WIDTH, CARD_HEIGHT]);
    for (const { corner, color } of markers) expectColor(colors[corner], color);
  });

  it("leaves a sideways card upside down when its top points right, and a half turn makes it upright", async () => {
    const image = await rectifyCard(
      await photoWithCard(pointingRight),
      asSent(pointingRight),
    );
    const upsideDown = await cornerColors(await rectifiedCropJpeg(image));
    for (const { opposite, color } of markers)
      expectColor(upsideDown[opposite], color);
    const turned = rotateHalfTurn(image);
    expect(turned.rotation).toBe(270);
    expect(turned.card).toEqual(image.card);
    const upright = await cornerColors(await rectifiedCropJpeg(turned));
    for (const { corner, color } of markers)
      expectColor(upright[corner], color);
  });

  it.each([
    ["upright", quad, false],
    ["sideways and turned", pointingRight, true],
  ] as const)(
    "maps the corners of a %s card back to the photo for the printing check",
    async (_label, card, turn) => {
      const rectified = await rectifyCard(
        await photoWithCard(card),
        asSent(card),
      );
      const image = turn ? rotateHalfTurn(rectified) : rectified;
      const { left, top, width, height } = image.card;
      const project = ([x, y]: [number, number]) => {
        const h = image.toPhoto;
        const w = h[6]! * x + h[7]! * y + h[8]!;
        return {
          x: (h[0]! * x + h[1]! * y + h[2]!) / w,
          y: (h[3]! * x + h[4]! * y + h[5]!) / w,
        };
      };
      const projected = (
        [
          [left, top],
          [left + width, top],
          [left + width, top + height],
          [left, top + height],
        ] as Array<[number, number]>
      ).map(project);
      const corners = [
        card.topLeft,
        card.topRight,
        card.bottomRight,
        card.bottomLeft,
      ];
      projected.forEach((point, index) => {
        expect(point.x).toBeCloseTo(corners[index]!.x, 6);
        expect(point.y).toBeCloseTo(corners[index]!.y, 6);
      });
    },
  );

  it("rejects bytes that are not a decodable photo", async () => {
    await expect(
      rectifyCard(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), quad),
    ).rejects.toThrow(RectifiedInputError);
  });
});
