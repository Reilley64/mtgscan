export const GRID_COLUMNS = 16;
export const GRID_ROWS = 22;
export const DESCRIPTOR_LENGTH = GRID_COLUMNS * GRID_ROWS * 3;
export const EDGE_COLUMNS = 32;
export const EDGE_ROWS = 44;
export const EDGE_DESCRIPTOR_LENGTH = (EDGE_COLUMNS - 2) * (EDGE_ROWS - 2);
const EDGE_MAP_COLUMNS = 64;
const EDGE_MAP_ROWS = 88;
const EDGE_BLUR = [0.0044, 0.054, 0.242, 0.3992, 0.242, 0.054, 0.0044];

export type AppearanceWindow = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type AppearanceReferences = { color: Float32Array; edge: Float32Array };
export type AppearanceScores = { color: Float32Array; edge: Float32Array };

export function appearanceDescriptors(
  rgb: Uint8Array,
  width: number,
  height: number,
  windows: AppearanceWindow[],
): Float32Array[] {
  const stride = width + 1;
  const integrals = [0, 1, 2].map(
    () => new Float64Array(stride * (height + 1)),
  );
  for (let y = 0; y < height; y++) {
    let lightness = 0,
      redGreen = 0,
      yellowBlue = 0;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      const red = rgb[offset]!,
        green = rgb[offset + 1]!,
        blue = rgb[offset + 2]!;
      lightness += (red + green + blue) / 3;
      redGreen += red - green;
      yellowBlue += (red + green) / 2 - blue;
      const below = (y + 1) * stride + x + 1,
        above = y * stride + x + 1;
      integrals[0]![below] = integrals[0]![above]! + lightness;
      integrals[1]![below] = integrals[1]![above]! + redGreen;
      integrals[2]![below] = integrals[2]![above]! + yellowBlue;
    }
  }
  const cells = GRID_COLUMNS * GRID_ROWS;
  return windows.map((window) => {
    const descriptor = new Float32Array(DESCRIPTOR_LENGTH);
    const xs = Array.from({ length: GRID_COLUMNS + 1 }, (_, index) =>
      Math.min(
        width,
        Math.max(
          0,
          Math.round(window.left + (window.width * index) / GRID_COLUMNS),
        ),
      ),
    );
    const ys = Array.from({ length: GRID_ROWS + 1 }, (_, index) =>
      Math.min(
        height,
        Math.max(
          0,
          Math.round(window.top + (window.height * index) / GRID_ROWS),
        ),
      ),
    );
    for (let channel = 0; channel < 3; channel++) {
      const integral = integrals[channel]!;
      let sum = 0;
      for (let row = 0; row < GRID_ROWS; row++)
        for (let column = 0; column < GRID_COLUMNS; column++) {
          const x0 = xs[column]!,
            x1 = Math.max(x0 + 1, xs[column + 1]!),
            y0 = ys[row]!,
            y1 = Math.max(y0 + 1, ys[row + 1]!);
          const area = (Math.min(width, x1) - x0) * (Math.min(height, y1) - y0);
          const value =
            area > 0
              ? (integral[y1 * stride + x1]! -
                  integral[y0 * stride + x1]! -
                  integral[y1 * stride + x0]! +
                  integral[y0 * stride + x0]!) /
                area
              : 0;
          descriptor[channel * cells + row * GRID_COLUMNS + column] = value;
          sum += value;
        }
      const mean = sum / cells;
      let squares = 0;
      for (
        let index = channel * cells;
        index < (channel + 1) * cells;
        index++
      ) {
        descriptor[index]! -= mean;
        squares += descriptor[index]! ** 2;
      }
      const norm = Math.sqrt(squares) || 1;
      const weight = channel === 0 ? 1 : 0.6;
      for (let index = channel * cells; index < (channel + 1) * cells; index++)
        descriptor[index] = (descriptor[index]! / norm) * weight;
    }
    let squares = 0;
    for (const value of descriptor) squares += value * value;
    const norm = Math.sqrt(squares) || 1;
    for (let index = 0; index < DESCRIPTOR_LENGTH; index++)
      descriptor[index]! /= norm;
    return descriptor;
  });
}

export function edgeDescriptors(
  rgb: Uint8Array,
  width: number,
  height: number,
  card: AppearanceWindow,
  windows: AppearanceWindow[],
): Float32Array[] {
  const mapWidth = Math.max(
      3,
      Math.round((width * EDGE_MAP_COLUMNS) / card.width),
    ),
    mapHeight = Math.max(3, Math.round((height * EDGE_MAP_ROWS) / card.height));
  const scaleX = mapWidth / width,
    scaleY = mapHeight / height;
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      row +=
        0.299 * rgb[offset]! +
        0.587 * rgb[offset + 1]! +
        0.114 * rgb[offset + 2]!;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + row;
    }
  }
  const gray = new Float32Array(mapWidth * mapHeight);
  for (let my = 0; my < mapHeight; my++) {
    const y0 = Math.min(height - 1, Math.floor((my * height) / mapHeight)),
      y1 = Math.max(y0 + 1, Math.floor(((my + 1) * height) / mapHeight));
    for (let mx = 0; mx < mapWidth; mx++) {
      const x0 = Math.min(width - 1, Math.floor((mx * width) / mapWidth)),
        x1 = Math.max(x0 + 1, Math.floor(((mx + 1) * width) / mapWidth));
      gray[my * mapWidth + mx] =
        (integral[y1 * stride + x1]! -
          integral[y0 * stride + x1]! -
          integral[y1 * stride + x0]! +
          integral[y0 * stride + x0]!) /
        ((x1 - x0) * (y1 - y0));
    }
  }
  const at = (x: number, y: number) =>
    gray[
      Math.min(mapHeight - 1, Math.max(0, y)) * mapWidth +
        Math.min(mapWidth - 1, Math.max(0, x))
    ]!;
  const magnitude = new Float32Array(mapWidth * mapHeight);
  for (let y = 0; y < mapHeight; y++)
    for (let x = 0; x < mapWidth; x++) {
      const gx =
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1);
      const gy =
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1) -
        at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1);
      magnitude[y * mapWidth + x] = Math.sqrt(gx * gx + gy * gy);
    }
  const radius = (EDGE_BLUR.length - 1) / 2;
  const across = new Float32Array(mapWidth * mapHeight);
  for (let y = 0; y < mapHeight; y++)
    for (let x = 0; x < mapWidth; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++)
        sum +=
          EDGE_BLUR[k + radius]! *
          magnitude[y * mapWidth + Math.min(mapWidth - 1, Math.max(0, x + k))]!;
      across[y * mapWidth + x] = sum;
    }
  const blurred = new Float32Array(mapWidth * mapHeight);
  for (let y = 0; y < mapHeight; y++)
    for (let x = 0; x < mapWidth; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++)
        sum +=
          EDGE_BLUR[k + radius]! *
          across[Math.min(mapHeight - 1, Math.max(0, y + k)) * mapWidth + x]!;
      blurred[y * mapWidth + x] = Math.log1p(sum);
    }
  return windows.map((window) => {
    const descriptor = new Float32Array(EDGE_DESCRIPTOR_LENGTH);
    let sum = 0,
      cell = 0;
    for (let row = 1; row < EDGE_ROWS - 1; row++) {
      const sy = Math.min(
        mapHeight - 1,
        Math.max(
          0,
          (window.top + (window.height * (row + 0.5)) / EDGE_ROWS) * scaleY -
            0.5,
        ),
      );
      const y0 = Math.floor(sy),
        y1 = Math.min(mapHeight - 1, y0 + 1),
        fy = sy - y0;
      for (let column = 1; column < EDGE_COLUMNS - 1; column++) {
        const sx = Math.min(
          mapWidth - 1,
          Math.max(
            0,
            (window.left + (window.width * (column + 0.5)) / EDGE_COLUMNS) *
              scaleX -
              0.5,
          ),
        );
        const x0 = Math.floor(sx),
          x1 = Math.min(mapWidth - 1, x0 + 1),
          fx = sx - x0;
        const top =
          blurred[y0 * mapWidth + x0]! * (1 - fx) +
          blurred[y0 * mapWidth + x1]! * fx;
        const bottom =
          blurred[y1 * mapWidth + x0]! * (1 - fx) +
          blurred[y1 * mapWidth + x1]! * fx;
        const value = top + (bottom - top) * fy;
        descriptor[cell++] = value;
        sum += value;
      }
    }
    const mean = sum / EDGE_DESCRIPTOR_LENGTH;
    let squares = 0;
    for (let index = 0; index < EDGE_DESCRIPTOR_LENGTH; index++) {
      descriptor[index]! -= mean;
      squares += descriptor[index]! ** 2;
    }
    const norm = Math.sqrt(squares) || 1;
    for (let index = 0; index < EDGE_DESCRIPTOR_LENGTH; index++)
      descriptor[index]! /= norm;
    return descriptor;
  });
}

export function bestAppearanceScores(
  queries: Float32Array[],
  references: Float32Array,
): Float32Array {
  const length = queries[0]?.length ?? 1;
  const count = references.length / length;
  const scores = new Float32Array(count).fill(-1);
  for (let reference = 0; reference < count; reference++) {
    const base = reference * length;
    for (const query of queries) {
      let dot = 0;
      for (let index = 0; index < length; index++)
        dot += query[index]! * references[base + index]!;
      if (dot > scores[reference]!) scores[reference] = dot;
    }
  }
  return scores;
}

export function rankByAppearance(
  image: {
    rgb: Uint8Array;
    width: number;
    height: number;
    card: AppearanceWindow;
  },
  references: AppearanceReferences,
): AppearanceScores {
  const window = (scale: number, shiftX: number, shiftY: number) => ({
    left: image.card.left + image.card.width * (0.5 + shiftX - scale / 2),
    top: image.card.top + image.card.height * (0.5 + shiftY - scale / 2),
    width: image.card.width * scale,
    height: image.card.height * scale,
  });
  const scales = [
    0.76, 0.8, 0.84, 0.88, 0.92, 0.96, 1, 1.04, 1.08, 1.12, 1.16, 1.2,
  ];
  const shifts = [-0.08, -0.04, 0, 0.04, 0.08];
  const windows = [
    ...[0.84, 0.92, 1, 1.08, 1.16].map((scale) => window(scale, 0, 0)),
    ...scales.flatMap((scale) =>
      shifts.flatMap((shiftX) =>
        shifts.map((shiftY) => window(scale, shiftX, shiftY)),
      ),
    ),
  ];
  const kinds = [
    {
      descriptors: appearanceDescriptors(
        image.rgb,
        image.width,
        image.height,
        windows,
      ),
      corpus: references.color,
    },
    {
      descriptors: edgeDescriptors(
        image.rgb,
        image.width,
        image.height,
        image.card,
        windows,
      ),
      corpus: references.edge,
    },
  ].map((kind) => ({
    ...kind,
    base: bestAppearanceScores(kind.descriptors.slice(0, 5), kind.corpus),
  }));
  const refine = ({ descriptors, corpus, base }: (typeof kinds)[number]) => {
    const length = descriptors[0]!.length;
    const scores = Float32Array.from(base);
    const shortlist = [...scores.keys()]
      .sort((a, b) => scores[b]! - scores[a]!)
      .slice(0, 40);
    const alignments = new Map<number, number>();
    for (const reference of shortlist) {
      const single = corpus.subarray(
        reference * length,
        (reference + 1) * length,
      );
      let best = scores[reference]!,
        bestWindow = -1;
      for (let candidate = 5; candidate < descriptors.length; candidate++) {
        const query = descriptors[candidate]!;
        let dot = 0;
        for (let index = 0; index < length; index++)
          dot += query[index]! * single[index]!;
        if (dot > best) {
          best = dot;
          bestWindow = candidate;
        }
      }
      scores[reference] = best;
      if (bestWindow >= 0) alignments.set(reference, bestWindow);
    }
    const aligned = [
      ...new Set(
        shortlist
          .sort((a, b) => scores[b]! - scores[a]!)
          .slice(0, 5)
          .map((reference) => alignments.get(reference))
          .filter((value) => value !== undefined),
      ),
    ].map((candidate) => descriptors[candidate]!);
    if (aligned.length) {
      const refined = bestAppearanceScores(aligned, corpus);
      for (let reference = 0; reference < scores.length; reference++)
        scores[reference] = Math.max(scores[reference]!, refined[reference]!);
    }
    return scores;
  };
  const [color, edge] = kinds;
  return { color: refine(color!), edge: refine(edge!) };
}
