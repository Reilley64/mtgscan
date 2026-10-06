import sharp from "sharp";

export const CARD_WIDTH = 488;
export const CARD_HEIGHT = 680;
export const RECTIFIED_MARGIN = 0.1;
export const MAX_PHOTO_BYTES = 12_000_000;

export type QuadPoint = { x: number; y: number };
export type CardQuad = {
  topLeft: QuadPoint;
  topRight: QuadPoint;
  bottomRight: QuadPoint;
  bottomLeft: QuadPoint;
};
export type RectifiedCardImage = {
  width: number;
  height: number;
  card: { left: number; top: number; width: number; height: number };
  rgb: Buffer;
  decodeMs: number;
  rectifyMs: number;
};

export class RectifiedInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RectifiedInputError";
  }
}

const cornerNames = [
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
] as const;

export function parseCardQuad(header: string | undefined): CardQuad {
  let value: unknown;
  try {
    value = JSON.parse(header ?? "");
  } catch {
    throw new RectifiedInputError("X-Card-Quad must be JSON");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    !cornerNames.every((name) => Object.hasOwn(value, name))
  )
    throw new RectifiedInputError(
      "X-Card-Quad must have exactly topLeft, topRight, bottomRight, and bottomLeft",
    );
  const record = value as Record<string, unknown>;
  const points = cornerNames.map((name) => {
    const point = record[name] as Record<string, unknown> | null;
    if (
      typeof point !== "object" ||
      point === null ||
      typeof point.x !== "number" ||
      typeof point.y !== "number" ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    )
      throw new RectifiedInputError(`${name} must have finite x and y`);
    if (
      point.x < -0.001 ||
      point.x > 1.001 ||
      point.y < -0.001 ||
      point.y > 1.001
    )
      throw new RectifiedInputError(`${name} is outside the photo`);
    return {
      x: Math.min(1, Math.max(0, point.x)),
      y: Math.min(1, Math.max(0, point.y)),
    };
  });
  let doubledArea = 0;
  for (let index = 0; index < 4; index++) {
    const a = points[index]!,
      b = points[(index + 1) % 4]!,
      c = points[(index + 2) % 4]!;
    const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (!(turn > 0))
      throw new RectifiedInputError(
        "card quad must be convex and clockwise from the top-left corner",
      );
    doubledArea += a.x * b.y - b.x * a.y;
  }
  if (doubledArea / 2 < 0.01)
    throw new RectifiedInputError("card quad is too small");
  const [topLeft, topRight, bottomRight, bottomLeft] = points as [
    QuadPoint,
    QuadPoint,
    QuadPoint,
    QuadPoint,
  ];
  return { topLeft, topRight, bottomRight, bottomLeft };
}

function solvePerspective(
  from: Array<[number, number]>,
  to: Array<[number, number]>,
): number[] {
  const rows: number[][] = [];
  for (let index = 0; index < 4; index++) {
    const [x, y] = from[index]!;
    const [u, v] = to[index]!;
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++)
      if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!))
        pivot = row;
    if (Math.abs(rows[pivot]![column]!) < 1e-12)
      throw new RectifiedInputError("card quad is degenerate");
    [rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
    const lead = rows[column]!;
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = rows[row]![column]! / lead[column]!;
      if (factor)
        for (let k = column; k < 9; k++) rows[row]![k]! -= factor * lead[k]!;
    }
  }
  return [...rows.map((row, index) => row[8]! / row[index]!), 1];
}

export async function rectifyCard(
  jpeg: Buffer,
  quad: CardQuad,
): Promise<RectifiedCardImage> {
  const started = performance.now();
  const metadata = await sharp(jpeg)
    .metadata()
    .catch(() => {
      throw new RectifiedInputError("photo could not be decoded");
    });
  if (!metadata.width || !metadata.height)
    throw new RectifiedInputError("photo has no dimensions");
  const swapped = (metadata.orientation ?? 1) >= 5;
  const orientedWidth = swapped ? metadata.height : metadata.width;
  const orientedHeight = swapped ? metadata.width : metadata.height;
  const corners = cornerNames.map((name) => quad[name]);
  const edge = (a: QuadPoint, b: QuadPoint) =>
    Math.hypot((a.x - b.x) * orientedWidth, (a.y - b.y) * orientedHeight);
  const cardHeightPixels = Math.max(
    edge(quad.topLeft, quad.bottomLeft),
    edge(quad.topRight, quad.bottomRight),
  );
  const scale = Math.min(1, (CARD_HEIGHT * 1.25) / cardHeightPixels);
  const { data: source, info } = await sharp(jpeg)
    .rotate()
    .resize({
      width: Math.max(1, Math.round(orientedWidth * scale)),
      height: Math.max(1, Math.round(orientedHeight * scale)),
      fit: "fill",
    })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw new RectifiedInputError("photo could not be decoded");
    });
  const decoded = performance.now();
  const marginX = Math.round(CARD_WIDTH * RECTIFIED_MARGIN);
  const marginY = Math.round(CARD_HEIGHT * RECTIFIED_MARGIN);
  const width = CARD_WIDTH + 2 * marginX;
  const height = CARD_HEIGHT + 2 * marginY;
  const h = solvePerspective(
    [
      [marginX, marginY],
      [marginX + CARD_WIDTH, marginY],
      [marginX + CARD_WIDTH, marginY + CARD_HEIGHT],
      [marginX, marginY + CARD_HEIGHT],
    ],
    corners.map((corner) => [corner.x * info.width, corner.y * info.height]),
  );
  const channels = info.channels;
  const rgb = Buffer.alloc(width * height * 3);
  const maxX = info.width - 1,
    maxY = info.height - 1;
  for (let y = 0; y < height; y++) {
    const v = y + 0.5;
    for (let x = 0; x < width; x++) {
      const u = x + 0.5;
      const w = h[6]! * u + h[7]! * v + h[8]!;
      const sx = Math.min(
        maxX,
        Math.max(0, (h[0]! * u + h[1]! * v + h[2]!) / w - 0.5),
      );
      const sy = Math.min(
        maxY,
        Math.max(0, (h[3]! * u + h[4]! * v + h[5]!) / w - 0.5),
      );
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy);
      const x1 = Math.min(maxX, x0 + 1),
        y1 = Math.min(maxY, y0 + 1);
      const fx = sx - x0,
        fy = sy - y0;
      const a = (y0 * info.width + x0) * channels,
        b = (y0 * info.width + x1) * channels,
        c = (y1 * info.width + x0) * channels,
        d = (y1 * info.width + x1) * channels;
      const target = (y * width + x) * 3;
      for (let k = 0; k < 3; k++) {
        const top = source[a + k]! + (source[b + k]! - source[a + k]!) * fx;
        const bottom = source[c + k]! + (source[d + k]! - source[c + k]!) * fx;
        rgb[target + k] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return {
    width,
    height,
    card: {
      left: marginX,
      top: marginY,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    },
    rgb,
    decodeMs: decoded - started,
    rectifyMs: performance.now() - decoded,
  };
}

export async function rectifiedCropJpeg(image: RectifiedCardImage) {
  return sharp(image.rgb, {
    raw: { width: image.width, height: image.height, channels: 3 },
  })
    .extract(image.card)
    .jpeg({ quality: 90 })
    .toBuffer();
}
