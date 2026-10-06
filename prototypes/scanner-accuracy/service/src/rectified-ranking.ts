export const GRID_COLUMNS = 16;
export const GRID_ROWS = 22;
export const DESCRIPTOR_LENGTH = GRID_COLUMNS * GRID_ROWS * 3;

export type AppearanceWindow = {
  left: number;
  top: number;
  width: number;
  height: number;
};

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

export function bestAppearanceScores(
  queries: Float32Array[],
  references: Float32Array,
): Float32Array {
  const count = references.length / DESCRIPTOR_LENGTH;
  const scores = new Float32Array(count).fill(-1);
  for (let reference = 0; reference < count; reference++) {
    const base = reference * DESCRIPTOR_LENGTH;
    for (const query of queries) {
      let dot = 0;
      for (let index = 0; index < DESCRIPTOR_LENGTH; index++)
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
  references: Float32Array,
): Float32Array {
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
  const descriptors = appearanceDescriptors(
    image.rgb,
    image.width,
    image.height,
    windows,
  );
  const scores = bestAppearanceScores(descriptors.slice(0, 5), references);
  const shortlist = [...scores.keys()]
    .sort((a, b) => scores[b]! - scores[a]!)
    .slice(0, 40);
  const alignments = new Map<number, number>();
  for (const reference of shortlist) {
    const single = references.subarray(
      reference * DESCRIPTOR_LENGTH,
      (reference + 1) * DESCRIPTOR_LENGTH,
    );
    let best = scores[reference]!,
      bestWindow = -1;
    for (let candidate = 5; candidate < descriptors.length; candidate++) {
      const query = descriptors[candidate]!;
      let dot = 0;
      for (let index = 0; index < DESCRIPTOR_LENGTH; index++)
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
    const refined = bestAppearanceScores(aligned, references);
    for (let reference = 0; reference < scores.length; reference++)
      scores[reference] = Math.max(scores[reference]!, refined[reference]!);
  }
  return scores;
}
