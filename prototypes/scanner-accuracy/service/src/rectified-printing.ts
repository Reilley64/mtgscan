import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const PRINTING_WIDTH = 745;
export const PRINTING_HEIGHT = 1040;
export const TILE = 16;
export const TILE_COLUMNS = Math.floor(PRINTING_WIDTH / TILE);
export const TILE_ROWS = Math.floor(PRINTING_HEIGHT / TILE);
export const COARSE_STEP = 8;
export const COARSE_WIDTH = Math.floor(PRINTING_WIDTH / COARSE_STEP);
export const COARSE_HEIGHT = Math.floor(PRINTING_HEIGHT / COARSE_STEP);
export const COARSE_MARGIN = 0.03;
export const SINGLE_CLUSTER_RATIO = 1.8;
export const PAIR_GAP = 0.03;
export const PAIR_RATIO = 2;
export const MAX_MARK_ERROR = 0.08;
export const MARK_NOISE_RATIO = 3;
export const MAX_UNEXPLAINED_TILES = 1;
const TILE_VALUES = TILE * TILE * 3;
const COARSE_VALUES = COARSE_WIDTH * COARSE_HEIGHT * 3;
const QUANTUM = 50;
const PREPARE_SHIFT = 2;
const MAX_CLUSTER_DIFFERENCE = 0.12;
const GRID = 32;
const FIELD_COLUMNS = Math.ceil(PRINTING_WIDTH / GRID) + 1;
const FIELD_ROWS = Math.ceil(PRINTING_HEIGHT / GRID) + 1;
const HALF_WIDTH = Math.floor(PRINTING_WIDTH / 2);
const HALF_HEIGHT = Math.floor(PRINTING_HEIGHT / 2);
const CONTROL_SHIFT = 5;
const COARSE_SHIFT = 1;
const COARSE_RING = 4;
const MAX_CONTROLS = 120;

export type Matrix = number[];
export type MemberMap = { affine: number[]; field: number[] };
export type PrintingCluster = {
  members: string[];
  maps: MemberMap[];
  tiles: number[];
  separating: number[][];
  controls: number[];
  tileData: Int8Array;
  controlData: Int8Array;
};
export type PrintingGroup = {
  illustrationId: string;
  clusters: PrintingCluster[];
  coarse: Map<string, Int8Array>;
};
export type PrintingIndex = {
  root: string;
  groups: Map<string, string[]>;
  load(illustrationId: string): Promise<PrintingGroup | null>;
};
export type PrintingMemberScore = {
  scryfallId: string;
  cluster: number;
  coarse: number;
  fine: number | null;
  markError: number | null;
  unexplained: number | null;
};
export type PrintingCheck = {
  illustrationId: string;
  chosen: string | null;
  reason: string | null;
  members: PrintingMemberScore[];
  alignment: { controls: number; usable: number; noise: number | null };
  canvas: Uint8Array;
};

export function multiply(a: Matrix, b: Matrix): Matrix {
  const result: number[] = [];
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 3; column++)
      result.push(
        a[row * 3]! * b[column]! +
          a[row * 3 + 1]! * b[3 + column]! +
          a[row * 3 + 2]! * b[6 + column]!,
      );
  return result;
}

export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const determinant = a * A + b * B + c * C;
  return [
    A / determinant,
    -(b * i - c * h) / determinant,
    (b * f - c * e) / determinant,
    B / determinant,
    (a * i - c * g) / determinant,
    -(a * f - c * d) / determinant,
    C / determinant,
    -(a * h - b * g) / determinant,
    (a * e - b * d) / determinant,
  ];
}

export function translate(x: number, y: number): Matrix {
  return [1, 0, x, 0, 1, y, 0, 0, 1];
}

type Image = {
  data: Uint8Array | Float32Array;
  width: number;
  height: number;
  channels: number;
};

function sample(
  source: Image,
  x: number,
  y: number,
  output: Float32Array,
  target: number,
  channels: number,
) {
  const sx = Math.min(source.width - 1, Math.max(0, x)),
    sy = Math.min(source.height - 1, Math.max(0, y));
  const x0 = Math.floor(sx),
    y0 = Math.floor(sy);
  const x1 = Math.min(source.width - 1, x0 + 1),
    y1 = Math.min(source.height - 1, y0 + 1);
  const fx = sx - x0,
    fy = sy - y0;
  const a = (y0 * source.width + x0) * source.channels,
    b = (y0 * source.width + x1) * source.channels,
    c = (y1 * source.width + x0) * source.channels,
    d = (y1 * source.width + x1) * source.channels;
  const data = source.data;
  for (let k = 0; k < channels; k++) {
    const top = data[a + k]! + (data[b + k]! - data[a + k]!) * fx;
    const bottom = data[c + k]! + (data[d + k]! - data[c + k]!) * fx;
    output[target + k] = top + (bottom - top) * fy;
  }
}

function mapPoint(map: MemberMap, x: number, y: number): [number, number] {
  const a = map.affine;
  const gx = Math.min(FIELD_COLUMNS - 1.001, Math.max(0, x / GRID)),
    gy = Math.min(FIELD_ROWS - 1.001, Math.max(0, y / GRID));
  const x0 = Math.floor(gx),
    y0 = Math.floor(gy),
    fx = gx - x0,
    fy = gy - y0;
  const at = (column: number, row: number, k: number) =>
    map.field[(row * FIELD_COLUMNS + column) * 2 + k]!;
  const field = [0, 1].map(
    (k) =>
      (at(x0, y0, k) * (1 - fx) + at(x0 + 1, y0, k) * fx) * (1 - fy) +
      (at(x0, y0 + 1, k) * (1 - fx) + at(x0 + 1, y0 + 1, k) * fx) * fy,
  );
  return [
    a[0]! * x + a[1]! * y + a[2]! + field[0]!,
    a[3]! * x + a[4]! * y + a[5]! + field[1]!,
  ];
}

function warp(
  source: Image,
  toSource: (x: number, y: number) => [number, number],
  channels: number,
): Float32Array {
  const step = 8;
  const columns = Math.ceil(PRINTING_WIDTH / step) + 1,
    rows = Math.ceil(PRINTING_HEIGHT / step) + 1;
  const nodes = new Float64Array(columns * rows * 2);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const [sx, sy] = toSource(column * step, row * step);
      nodes[(row * columns + column) * 2] = sx;
      nodes[(row * columns + column) * 2 + 1] = sy;
    }
  const output = new Float32Array(PRINTING_WIDTH * PRINTING_HEIGHT * channels);
  for (let y = 0; y < PRINTING_HEIGHT; y++) {
    const row = Math.floor(y / step),
      fy = y / step - row;
    for (let x = 0; x < PRINTING_WIDTH; x++) {
      const column = Math.floor(x / step),
        fx = x / step - column;
      const a = (row * columns + column) * 2,
        b = a + 2,
        c = a + columns * 2,
        d = c + 2;
      const sx =
        (nodes[a]! * (1 - fx) + nodes[b]! * fx) * (1 - fy) +
        (nodes[c]! * (1 - fx) + nodes[d]! * fx) * fy;
      const sy =
        (nodes[a + 1]! * (1 - fx) + nodes[b + 1]! * fx) * (1 - fy) +
        (nodes[c + 1]! * (1 - fx) + nodes[d + 1]! * fx) * fy;
      sample(
        source,
        sx,
        sy,
        output,
        (y * PRINTING_WIDTH + x) * channels,
        channels,
      );
    }
  }
  return output;
}

function applyHomography(h: Matrix, x: number, y: number): [number, number] {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return [
    (h[0]! * x + h[1]! * y + h[2]!) / w,
    (h[3]! * x + h[4]! * y + h[5]!) / w,
  ];
}

function separable(
  values: Float32Array,
  width: number,
  height: number,
  channels: number,
  radius: number,
  weights: number[] | null,
): Float32Array {
  const stride = width * channels;
  const size = 2 * radius + 1;
  const across = new Float32Array(values.length);
  const padded = new Float32Array((width + 2 * radius) * channels);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width + 2 * radius; x++) {
      const from =
        row + Math.min(width - 1, Math.max(0, x - radius)) * channels;
      for (let k = 0; k < channels; k++)
        padded[x * channels + k] = values[from + k]!;
    }
    if (weights)
      for (let tap = 0; tap < size; tap++) {
        const weight = weights[tap]!,
          shift = tap * channels;
        for (let index = 0; index < stride; index++)
          across[row + index]! += weight * padded[index + shift]!;
      }
    else
      for (let k = 0; k < channels; k++) {
        let sum = 0;
        for (let tap = 0; tap < size; tap++) sum += padded[tap * channels + k]!;
        for (let x = 0; x < width; x++) {
          across[row + x * channels + k] = sum / size;
          sum +=
            (padded[(x + size) * channels + k] ?? 0) -
            padded[x * channels + k]!;
        }
      }
  }
  const output = new Float32Array(values.length);
  const rowAt = (y: number) => Math.min(height - 1, Math.max(0, y)) * stride;
  if (weights) {
    for (let y = 0; y < height; y++) {
      const row = y * stride;
      for (let tap = 0; tap < size; tap++) {
        const weight = weights[tap]!,
          from = rowAt(y + tap - radius);
        for (let index = 0; index < stride; index++)
          output[row + index]! += weight * across[from + index]!;
      }
    }
    return output;
  }
  const sums = new Float32Array(stride);
  for (let tap = -radius; tap <= radius; tap++) {
    const from = rowAt(tap);
    for (let index = 0; index < stride; index++)
      sums[index]! += across[from + index]!;
  }
  for (let y = 0; y < height; y++) {
    const row = y * stride,
      entering = rowAt(y + radius + 1),
      leaving = rowAt(y - radius);
    for (let index = 0; index < stride; index++) {
      output[row + index] = sums[index]! / size;
      sums[index]! += across[entering + index]! - across[leaving + index]!;
    }
  }
  return output;
}

export function localContrast(
  rgb: Float32Array,
  width: number,
  height: number,
  options: { blur: boolean; radius: number },
): Float32Array {
  const source = options.blur
    ? separable(rgb, width, height, 3, 2, [0.054, 0.242, 0.399, 0.242, 0.054])
    : rgb;
  const mean = separable(source, width, height, 3, options.radius, null);
  const detail = new Float32Array(source.length);
  const energy = new Float32Array(width * height);
  for (let index = 0; index < width * height; index++) {
    let sum = 0;
    for (let k = 0; k < 3; k++) {
      const value = source[index * 3 + k]! - mean[index * 3 + k]!;
      detail[index * 3 + k] = value;
      sum += value * value;
    }
    energy[index] = sum;
  }
  const spread = separable(energy, width, height, 1, options.radius, null);
  for (let index = 0; index < width * height; index++) {
    const norm = Math.sqrt(spread[index]! + 400);
    for (let k = 0; k < 3; k++) detail[index * 3 + k]! /= norm;
  }
  return detail;
}

function quantize(values: Float32Array): Int8Array {
  return Int8Array.from(values, (value) =>
    Math.max(-127, Math.min(127, Math.round(value * QUANTUM))),
  );
}

function coarseContrast(rgb: Float32Array): Float32Array {
  const small = new Float32Array(COARSE_VALUES);
  for (let y = 0; y < COARSE_HEIGHT; y++)
    for (let x = 0; x < COARSE_WIDTH; x++)
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let dy = 0; dy < COARSE_STEP; dy++)
          for (let dx = 0; dx < COARSE_STEP; dx++)
            sum +=
              rgb[
                ((y * COARSE_STEP + dy) * PRINTING_WIDTH +
                  x * COARSE_STEP +
                  dx) *
                  3 +
                  k
              ]!;
        small[(y * COARSE_WIDTH + x) * 3 + k] = sum / COARSE_STEP ** 2;
      }
  return localContrast(small, COARSE_WIDTH, COARSE_HEIGHT, {
    blur: false,
    radius: 2,
  });
}

function tileError(
  query: Float32Array,
  tile: number,
  shiftX: number,
  shiftY: number,
  reference: Int8Array,
  offset: number,
): number {
  const left = (tile % TILE_COLUMNS) * TILE + shiftX,
    top = Math.floor(tile / TILE_COLUMNS) * TILE + shiftY;
  const inside =
    left >= 0 &&
    top >= 0 &&
    left + TILE <= PRINTING_WIDTH &&
    top + TILE <= PRINTING_HEIGHT;
  let sum = 0,
    position = offset;
  for (let y = 0; y < TILE; y++) {
    const row = inside
      ? (top + y) * PRINTING_WIDTH
      : Math.min(PRINTING_HEIGHT - 1, Math.max(0, top + y)) * PRINTING_WIDTH;
    if (inside) {
      let base = (row + left) * 3;
      for (let end = position + TILE * 3; position < end; position++, base++) {
        const difference = query[base]! - reference[position]! / QUANTUM;
        sum += difference * difference;
      }
      continue;
    }
    for (let x = 0; x < TILE; x++) {
      const base =
        (row + Math.min(PRINTING_WIDTH - 1, Math.max(0, left + x))) * 3;
      for (let k = 0; k < 3; k++) {
        const difference = query[base + k]! - reference[position++]! / QUANTUM;
        sum += difference * difference;
      }
    }
  }
  return sum / TILE_VALUES;
}

function tileValues(contrast: Float32Array, tile: number): Float32Array {
  const values = new Float32Array(TILE_VALUES);
  const left = (tile % TILE_COLUMNS) * TILE,
    top = Math.floor(tile / TILE_COLUMNS) * TILE;
  let position = 0;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++)
      for (let k = 0; k < 3; k++)
        values[position++] =
          contrast[((top + y) * PRINTING_WIDTH + left + x) * 3 + k]!;
  return values;
}

function shiftedDifference(
  a: Float32Array,
  b: Float32Array,
  tile: number,
  shift: number,
): number {
  const reference = quantize(tileValues(a, tile));
  let best = Infinity;
  for (let dy = -shift; dy <= shift; dy++)
    for (let dx = -shift; dx <= shift; dx++)
      best = Math.min(best, tileError(b, tile, dx, dy, reference, 0));
  return best;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function estimateShift(
  reference: Float32Array,
  query: Float32Array,
  width: number,
  height: number,
  left: number,
  top: number,
  size: number,
  centerX: number,
  centerY: number,
  radius: number,
) {
  const errors: number[] = [];
  const side = 2 * radius + 1;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      let sum = 0;
      for (let y = 0; y < size; y++) {
        const qy = Math.min(height - 1, Math.max(0, top + y + centerY + dy));
        for (let x = 0; x < size; x++) {
          const qx = Math.min(width - 1, Math.max(0, left + x + centerX + dx));
          const r = ((top + y) * width + left + x) * 3,
            q = (qy * width + qx) * 3;
          for (let k = 0; k < 3; k++) {
            const difference = reference[r + k]! - query[q + k]!;
            sum += difference * difference;
          }
        }
      }
      errors.push(sum / (size * size * 3));
    }
  const best = errors.indexOf(Math.min(...errors));
  const bx = best % side,
    by = Math.floor(best / side);
  const refine = (low: number, middle: number, high: number) => {
    const curvature = low - 2 * middle + high;
    return curvature > 1e-9 ? (0.5 * (low - high)) / curvature : 0;
  };
  const edge = bx === 0 || by === 0 || bx === side - 1 || by === side - 1;
  return {
    dx:
      centerX +
      bx -
      radius +
      (edge ? 0 : refine(errors[best - 1]!, errors[best]!, errors[best + 1]!)),
    dy:
      centerY +
      by -
      radius +
      (edge
        ? 0
        : refine(errors[best - side]!, errors[best]!, errors[best + side]!)),
    error: errors[best]!,
    confident: !edge && errors[best]! < 0.5 * median(errors),
  };
}

function fitShifts<
  Point extends { x: number; y: number; dx: number; dy: number },
>(points: Point[], tolerance: number, projective = false) {
  const solve = (subset: Point[]) => {
    const unknowns = projective ? 8 : 6;
    const normal = Array.from({ length: unknowns }, () =>
      new Array(unknowns + 1).fill(0),
    );
    const add = (row: number[], value: number) => {
      for (let i = 0; i < unknowns; i++) {
        for (let j = 0; j < unknowns; j++) normal[i]![j] += row[i]! * row[j]!;
        normal[i]![unknowns] += row[i]! * value;
      }
    };
    for (const point of subset) {
      const x = point.x / PRINTING_WIDTH,
        y = point.y / PRINTING_HEIGHT;
      const u = (point.x + point.dx) / PRINTING_WIDTH,
        v = (point.y + point.dy) / PRINTING_HEIGHT;
      add(
        projective ? [x, y, 1, 0, 0, 0, -u * x, -u * y] : [x, y, 1, 0, 0, 0],
        u,
      );
      add(
        projective ? [0, 0, 0, x, y, 1, -v * x, -v * y] : [0, 0, 0, x, y, 1],
        v,
      );
    }
    for (let column = 0; column < unknowns; column++) {
      let pivot = column;
      for (let row = column + 1; row < unknowns; row++)
        if (Math.abs(normal[row]![column]) > Math.abs(normal[pivot]![column]))
          pivot = row;
      [normal[column], normal[pivot]] = [normal[pivot]!, normal[column]!];
      const lead = normal[column]!;
      if (Math.abs(lead[column]) < 1e-12) return null;
      for (let row = 0; row < unknowns; row++) {
        if (row === column) continue;
        const factor = normal[row]![column] / lead[column];
        for (let k = column; k <= unknowns; k++)
          normal[row]![k] -= factor * lead[k];
      }
    }
    const h = normal.map((row, index) => row[unknowns] / row[index]);
    if (!projective) h.push(0, 0);
    return (px: number, py: number) => {
      const x = px / PRINTING_WIDTH,
        y = py / PRINTING_HEIGHT;
      const w = h[6]! * x + h[7]! * y + 1;
      return {
        dx: ((h[0]! * x + h[1]! * y + h[2]!) / w) * PRINTING_WIDTH - px,
        dy: ((h[3]! * x + h[4]! * y + h[5]!) / w) * PRINTING_HEIGHT - py,
      };
    };
  };
  if (points.length < 12) return null;
  const startX = median(points.map((point) => point.dx)),
    startY = median(points.map((point) => point.dy));
  let model: (x: number, y: number) => { dx: number; dy: number } = () => ({
    dx: startX,
    dy: startY,
  });
  let kept = points;
  for (const limit of [3 * tolerance, tolerance, tolerance]) {
    kept = points.filter((point) => {
      const predicted = model(point.x, point.y);
      return (
        Math.hypot(predicted.dx - point.dx, predicted.dy - point.dy) <= limit
      );
    });
    if (kept.length < 12) return null;
    const solved = solve(kept);
    if (!solved) return null;
    model = solved;
  }
  return { model, kept };
}

function shrink(
  rgb: Float32Array,
  factor: number,
  width: number,
  height: number,
) {
  const small = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++)
          for (let dx = 0; dx < factor; dx++)
            sum +=
              rgb[
                ((y * factor + dy) * PRINTING_WIDTH + x * factor + dx) * 3 + k
              ]!;
        small[(y * width + x) * 3 + k] = sum / factor ** 2;
      }
  return small;
}

function alignToAnchor(
  anchor: { half: Float32Array; full: Float32Array; coarse: Int8Array },
  member: { rgba: Float32Array; half: Float32Array; coarse: Int8Array },
): MemberMap | null {
  let start = { dx: 0, dy: 0, error: Infinity };
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      let sum = 0;
      for (let y = 4; y < COARSE_HEIGHT - 4; y++)
        for (let x = 4; x < COARSE_WIDTH - 4; x++)
          for (let k = 0; k < 3; k++) {
            const difference =
              anchor.coarse[(y * COARSE_WIDTH + x) * 3 + k]! -
              member.coarse[((y + dy) * COARSE_WIDTH + x + dx) * 3 + k]!;
            sum += difference * difference;
          }
      if (sum < start.error) start = { dx, dy, error: sum };
    }
  const halfPoints = [];
  for (let top = 8; top + 8 <= HALF_HEIGHT - 8; top += 16)
    for (let left = 8; left + 8 <= HALF_WIDTH - 8; left += 16) {
      const shift = estimateShift(
        anchor.half,
        member.half,
        HALF_WIDTH,
        HALF_HEIGHT,
        left,
        top,
        8,
        start.dx * 4,
        start.dy * 4,
        4,
      );
      if (shift.confident)
        halfPoints.push({
          x: (left + 4) * 2,
          y: (top + 4) * 2,
          dx: shift.dx * 2,
          dy: shift.dy * 2,
        });
    }
  const coarseFit = fitShifts(halfPoints, 3);
  if (
    !coarseFit ||
    coarseFit.kept.length < 40 ||
    coarseFit.kept.length < 0.5 * halfPoints.length
  )
    return null;
  const at = (x: number, y: number) => coarseFit.model(x, y);
  const corners = [
    [0, 0],
    [PRINTING_WIDTH, 0],
    [0, PRINTING_HEIGHT],
    [PRINTING_WIDTH, PRINTING_HEIGHT],
  ].map(([x, y]) => at(x!, y!));
  if (corners.some((corner) => Math.hypot(corner.dx, corner.dy) > 40))
    return null;
  const affine = [
    1 + (at(PRINTING_WIDTH, 0).dx - at(0, 0).dx) / PRINTING_WIDTH,
    (at(0, PRINTING_HEIGHT).dx - at(0, 0).dx) / PRINTING_HEIGHT,
    at(0, 0).dx,
    (at(PRINTING_WIDTH, 0).dy - at(0, 0).dy) / PRINTING_WIDTH,
    1 + (at(0, PRINTING_HEIGHT).dy - at(0, 0).dy) / PRINTING_HEIGHT,
    at(0, 0).dy,
  ];
  const flat: MemberMap = {
    affine,
    field: new Array(FIELD_COLUMNS * FIELD_ROWS * 2).fill(0),
  };
  const warped = warp(
    {
      data: member.rgba,
      width: PRINTING_WIDTH,
      height: PRINTING_HEIGHT,
      channels: 4,
    },
    (x, y) => mapPoint(flat, x, y),
    3,
  );
  const contrast = localContrast(warped, PRINTING_WIDTH, PRINTING_HEIGHT, {
    blur: true,
    radius: 7,
  });
  const nodes: Array<{ dx: number; dy: number } | null> = [];
  for (let row = 0; row < FIELD_ROWS; row++)
    for (let column = 0; column < FIELD_COLUMNS; column++) {
      const left = column * GRID - TILE / 2,
        top = row * GRID - TILE / 2;
      if (
        left < 4 ||
        top < 4 ||
        left + TILE > PRINTING_WIDTH - 4 ||
        top + TILE > PRINTING_HEIGHT - 4
      ) {
        nodes.push(null);
        continue;
      }
      const shift = estimateShift(
        anchor.full,
        contrast,
        PRINTING_WIDTH,
        PRINTING_HEIGHT,
        left,
        top,
        TILE,
        0,
        0,
        3,
      );
      nodes.push(shift.confident ? { dx: shift.dx, dy: shift.dy } : null);
    }
  const field: number[] = [];
  for (let row = 0; row < FIELD_ROWS; row++)
    for (let column = 0; column < FIELD_COLUMNS; column++) {
      const near: Array<{ dx: number; dy: number }> = [];
      for (let r = row - 2; r <= row + 2; r++)
        for (let c = column - 2; c <= column + 2; c++) {
          const node =
            r >= 0 && c >= 0 && r < FIELD_ROWS && c < FIELD_COLUMNS
              ? nodes[r * FIELD_COLUMNS + c]
              : null;
          if (node) near.push(node);
        }
      if (near.length < 3) {
        field.push(0, 0);
        continue;
      }
      const middle = {
        dx: median(near.map((node) => node.dx)),
        dy: median(near.map((node) => node.dy)),
      };
      const own = nodes[row * FIELD_COLUMNS + column];
      const value =
        own && Math.hypot(own.dx - middle.dx, own.dy - middle.dy) <= 1
          ? own
          : middle;
      field.push(value.dx, value.dy);
    }
  return { affine, field };
}

export async function buildPrintingGroup(
  illustrationId: string,
  members: Array<{ scryfallId: string; image: Buffer }>,
): Promise<{ group: PrintingGroup; clusters: number; tiles: number }> {
  const decoded = await Promise.all(
    members.map(async (member) => {
      const { data } = await sharp(member.image)
        .resize(PRINTING_WIDTH, PRINTING_HEIGHT, { fit: "fill" })
        .ensureAlpha()
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      const rgba = Float32Array.from(data);
      const rgb = new Float32Array(PRINTING_WIDTH * PRINTING_HEIGHT * 3);
      for (let index = 0; index < PRINTING_WIDTH * PRINTING_HEIGHT; index++)
        for (let k = 0; k < 3; k++) rgb[index * 3 + k] = rgba[index * 4 + k]!;
      return {
        scryfallId: member.scryfallId,
        rgba,
        full: localContrast(rgb, PRINTING_WIDTH, PRINTING_HEIGHT, {
          blur: true,
          radius: 7,
        }),
        half: localContrast(
          shrink(rgb, 2, HALF_WIDTH, HALF_HEIGHT),
          HALF_WIDTH,
          HALF_HEIGHT,
          {
            blur: true,
            radius: 4,
          },
        ),
        coarse: quantize(coarseContrast(rgb)),
      };
    }),
  );
  const coarse = new Map(
    decoded.map((member) => [member.scryfallId, member.coarse]),
  );
  let remaining = [...decoded.keys()];
  const clusters: PrintingCluster[] = [];
  const opaqueTiles = (rgba: Float32Array) => {
    const tiles = new Set<number>();
    for (let tile = 0; tile < TILE_COLUMNS * TILE_ROWS; tile++) {
      const left = (tile % TILE_COLUMNS) * TILE,
        top = Math.floor(tile / TILE_COLUMNS) * TILE;
      let opaque = true;
      for (let y = top; y < top + TILE && opaque; y++)
        for (let x = left; x < left + TILE && opaque; x++)
          opaque = rgba[(y * PRINTING_WIDTH + x) * 4 + 3]! > 250;
      if (opaque) tiles.add(tile);
    }
    return tiles;
  };
  const contrastOf = (rgba: Float32Array) => {
    const rgb = new Float32Array(PRINTING_WIDTH * PRINTING_HEIGHT * 3);
    for (let index = 0; index < PRINTING_WIDTH * PRINTING_HEIGHT; index++)
      for (let k = 0; k < 3; k++) rgb[index * 3 + k] = rgba[index * 4 + k]!;
    return localContrast(rgb, PRINTING_WIDTH, PRINTING_HEIGHT, {
      blur: true,
      radius: 7,
    });
  };
  while (remaining.length) {
    const anchor = decoded[remaining[0]!]!;
    const anchorTiles = [...opaqueTiles(anchor.rgba)];
    const joined: Array<{
      index: number;
      map: MemberMap;
      rgba: Float32Array;
      contrast: Float32Array;
      differences: Map<number, number>;
      level: number;
    }> = [
      {
        index: remaining[0]!,
        map: {
          affine: [1, 0, 0, 0, 1, 0],
          field: new Array(FIELD_COLUMNS * FIELD_ROWS * 2).fill(0),
        },
        rgba: anchor.rgba,
        contrast: anchor.full,
        differences: new Map(),
        level: 0,
      },
    ];
    const rest: number[] = [];
    for (const index of remaining.slice(1)) {
      const map = alignToAnchor(anchor, decoded[index]!);
      if (!map) {
        rest.push(index);
        continue;
      }
      const rgba = warp(
        {
          data: decoded[index]!.rgba,
          width: PRINTING_WIDTH,
          height: PRINTING_HEIGHT,
          channels: 4,
        },
        (x, y) => mapPoint(map, x, y),
        4,
      );
      const contrast = contrastOf(rgba);
      const own = opaqueTiles(rgba);
      const shared = anchorTiles.filter((tile) => own.has(tile));
      const differences = new Map(
        shared.map((tile) => [
          tile,
          shiftedDifference(anchor.full, contrast, tile, PREPARE_SHIFT),
        ]),
      );
      const level = median([...differences.values()]);
      const differing = [...differences.values()].filter(
        (difference) => difference > 0.08,
      ).length;
      if (differing > MAX_CLUSTER_DIFFERENCE * shared.length) rest.push(index);
      else joined.push({ index, map, rgba, contrast, differences, level });
    }
    remaining = rest;
    const contrasts = joined.map((member) => member.contrast);
    const warped = joined.map((member) => member.rgba);
    const validTiles = anchorTiles.filter((tile) =>
      joined.every(
        (member, position) => position === 0 || member.differences.has(tile),
      ),
    );
    const noise = joined.map((member) => member.level);
    const marked = new Set<number>();
    for (const member of joined.slice(1))
      for (const tile of validTiles)
        if (member.differences.get(tile)! > Math.max(0.08, 6 * member.level))
          marked.add(tile);
    const tiles = [...marked].sort((a, b) => a - b);
    const separating: number[][] = [];
    for (let a = 0; a < joined.length; a++)
      for (let b = a + 1; b < joined.length; b++) {
        const threshold = Math.max(0.08, 6 * Math.max(noise[a]!, noise[b]!));
        separating.push(
          tiles.flatMap((tile, position) =>
            shiftedDifference(
              contrasts[a]!,
              contrasts[b]!,
              tile,
              PREPARE_SHIFT,
            ) > threshold
              ? [position]
              : [],
          ),
        );
      }
    const textured = validTiles.filter((tile) => {
      const column = tile % TILE_COLUMNS,
        row = Math.floor(tile / TILE_COLUMNS);
      if (
        marked.has(tile) ||
        column < 1 ||
        row < 1 ||
        column >= TILE_COLUMNS - 1 ||
        row >= TILE_ROWS - 1
      )
        return false;
      let sum = 0,
        squares = 0;
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const base =
            ((row * TILE + y) * PRINTING_WIDTH + column * TILE + x) * 4;
          const value =
            0.299 * warped[0]![base]! +
            0.587 * warped[0]![base + 1]! +
            0.114 * warped[0]![base + 2]!;
          sum += value;
          squares += value * value;
        }
      return squares / TILE ** 2 - (sum / TILE ** 2) ** 2 > 18 ** 2;
    });
    const bands = 8;
    const controls = Array.from({ length: bands }, (_, band) => {
      const inBand = textured.filter(
        (tile) =>
          Math.floor((Math.floor(tile / TILE_COLUMNS) * bands) / TILE_ROWS) ===
          band,
      );
      const quota = Math.min(MAX_CONTROLS / bands, inBand.length);
      return Array.from(
        { length: quota },
        (_, index) => inBand[Math.floor((index * inBand.length) / quota)]!,
      );
    }).flat();
    const tileData = new Int8Array(joined.length * tiles.length * TILE_VALUES);
    contrasts.forEach((contrast, member) =>
      tiles.forEach((tile, position) =>
        tileData.set(
          quantize(tileValues(contrast, tile)),
          (member * tiles.length + position) * TILE_VALUES,
        ),
      ),
    );
    const controlData = new Int8Array(controls.length * TILE_VALUES);
    controls.forEach((tile, position) =>
      controlData.set(
        quantize(tileValues(contrasts[0]!, tile)),
        position * TILE_VALUES,
      ),
    );
    clusters.push({
      members: joined.map(({ index }) => decoded[index]!.scryfallId),
      maps: joined.map(({ map }) => map),
      tiles,
      separating,
      controls,
      tileData,
      controlData,
    });
  }
  return {
    group: { illustrationId, clusters, coarse },
    clusters: clusters.length,
    tiles: clusters.reduce((sum, cluster) => sum + cluster.tiles.length, 0),
  };
}

export async function writePrintingGroups(
  root: string,
  groups: PrintingGroup[],
) {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  for (const group of groups) {
    const chunks: Uint8Array[] = [];
    let offset = 0;
    const add = (values: Int8Array) => {
      chunks.push(
        new Uint8Array(values.buffer, values.byteOffset, values.byteLength),
      );
      offset += values.byteLength;
      return offset - values.byteLength;
    };
    const coarse = Object.fromEntries(
      [...group.coarse].map(([scryfallId, values]) => [
        scryfallId,
        add(values),
      ]),
    );
    const clusters = group.clusters.map(
      ({ tileData, controlData, ...cluster }) => ({
        ...cluster,
        tileOffset: add(tileData),
        controlOffset: add(controlData),
      }),
    );
    await fs.writeFile(
      path.join(root, `${group.illustrationId}.bin`),
      Buffer.concat(chunks),
    );
    await fs.writeFile(
      path.join(root, `${group.illustrationId}.json`),
      JSON.stringify({
        illustrationId: group.illustrationId,
        coarse,
        clusters,
      }),
    );
  }
  await fs.writeFile(
    path.join(root, "index.json"),
    JSON.stringify(
      Object.fromEntries(
        groups.map((group) => [
          group.illustrationId,
          group.clusters.flatMap((cluster) => cluster.members),
        ]),
      ),
    ),
  );
}

export async function loadPrintingIndex(
  root: string,
): Promise<PrintingIndex | undefined> {
  const index = await fs
    .readFile(path.join(root, "index.json"), "utf8")
    .then((text) => JSON.parse(text) as Record<string, string[]>)
    .catch(() => undefined);
  if (!index) return undefined;
  const groups = new Map(Object.entries(index));
  const cache = new Map<string, Promise<PrintingGroup | null>>();
  return {
    root,
    groups,
    load(illustrationId) {
      if (!groups.has(illustrationId)) return Promise.resolve(null);
      let pending = cache.get(illustrationId);
      if (!pending) {
        pending = (async () => {
          const meta = JSON.parse(
            await fs.readFile(
              path.join(root, `${illustrationId}.json`),
              "utf8",
            ),
          ) as {
            coarse: Record<string, number>;
            clusters: Array<
              Omit<PrintingCluster, "tileData" | "controlData"> & {
                tileOffset: number;
                controlOffset: number;
              }
            >;
          };
          const bytes = await fs.readFile(
            path.join(root, `${illustrationId}.bin`),
          );
          const view = (offset: number, length: number) =>
            new Int8Array(bytes.buffer, bytes.byteOffset + offset, length);
          return {
            illustrationId,
            coarse: new Map(
              Object.entries(meta.coarse).map(([id, offset]) => [
                id,
                view(offset, COARSE_VALUES),
              ]),
            ),
            clusters: meta.clusters.map(
              ({ tileOffset, controlOffset, ...cluster }) => ({
                ...cluster,
                tileData: view(
                  tileOffset,
                  cluster.members.length * cluster.tiles.length * TILE_VALUES,
                ),
                controlData: view(
                  controlOffset,
                  cluster.controls.length * TILE_VALUES,
                ),
              }),
            ),
          };
        })();
        pending.catch(() => cache.delete(illustrationId));
        cache.set(illustrationId, pending);
      }
      return pending;
    },
  };
}

export function checkPrinting(
  group: PrintingGroup,
  topId: string,
  photo: Image,
  topToPhoto: Matrix,
): PrintingCheck {
  const topCluster = group.clusters.findIndex((cluster) =>
    cluster.members.includes(topId),
  );
  const topMap =
    group.clusters[topCluster]!.maps[
      group.clusters[topCluster]!.members.indexOf(topId)
    ]!;
  let canvas = warp(
    photo,
    (x, y) => {
      const [mx, my] = mapPoint(topMap, x, y);
      return applyHomography(topToPhoto, mx, my);
    },
    3,
  );
  const members: PrintingMemberScore[] = group.clusters.flatMap(
    (cluster, index) =>
      cluster.members.map((scryfallId) => ({
        scryfallId,
        cluster: index,
        coarse: Number.NaN,
        fine: null,
        markError: null,
        unexplained: null,
      })),
  );
  const alignment = { controls: 0, usable: 0, noise: null as number | null };
  const finish = (chosen: string | null, reason: string | null) => {
    const pixels = new Uint8Array(canvas.length);
    for (let index = 0; index < canvas.length; index++)
      pixels[index] = Math.max(0, Math.min(255, Math.round(canvas[index]!)));
    return {
      illustrationId: group.illustrationId,
      chosen,
      reason,
      members,
      alignment,
      canvas: pixels,
    };
  };
  let clusterIndex = topCluster;
  if (group.clusters.length > 1) {
    const queryCoarse = coarseContrast(canvas);
    const shifts = new Map<string, { dx: number; dy: number }>();
    for (const member of members) {
      const reference = group.coarse.get(member.scryfallId)!;
      let best = Infinity;
      for (let dy = -COARSE_SHIFT; dy <= COARSE_SHIFT; dy++)
        for (let dx = -COARSE_SHIFT; dx <= COARSE_SHIFT; dx++) {
          let sum = 0,
            count = 0;
          for (let y = COARSE_RING; y < COARSE_HEIGHT - COARSE_RING; y++)
            for (let x = COARSE_RING; x < COARSE_WIDTH - COARSE_RING; x++) {
              const query = ((y + dy) * COARSE_WIDTH + x + dx) * 3,
                own = (y * COARSE_WIDTH + x) * 3;
              for (let k = 0; k < 3; k++) {
                const difference =
                  queryCoarse[query + k]! - reference[own + k]! / QUANTUM;
                sum += difference * difference;
              }
              count += 3;
            }
          if (sum / count < best) {
            best = sum / count;
            shifts.set(member.scryfallId, {
              dx: dx * COARSE_STEP,
              dy: dy * COARSE_STEP,
            });
          }
        }
      member.coarse = best;
    }
    const ordered = [...members].sort((a, b) => a.coarse - b.coarse);
    const leader = ordered[0]!;
    const rival = ordered.find((member) => member.cluster !== leader.cluster)!;
    if (
      rival.coarse - leader.coarse < COARSE_MARGIN ||
      (group.clusters[leader.cluster]!.members.length === 1 &&
        rival.coarse < SINGLE_CLUSTER_RATIO * leader.coarse)
    )
      return finish(
        null,
        `same-art printings with different frames are too close: ${leader.scryfallId} has coarse error ${leader.coarse.toFixed(3)} and ${rival.scryfallId} has ${rival.coarse.toFixed(3)}`,
      );
    clusterIndex = leader.cluster;
    if (clusterIndex !== topCluster) {
      const shift = shifts.get(leader.scryfallId)!;
      canvas = warp(
        photo,
        (x, y) => {
          const [mx, my] = mapPoint(topMap, x + shift.dx, y + shift.dy);
          return applyHomography(topToPhoto, mx, my);
        },
        3,
      );
    }
  }
  const cluster = group.clusters[clusterIndex]!;
  if (cluster.members.length === 1)
    return cluster.members[0] === topId
      ? finish(topId, null)
      : finish(
          null,
          `the closest frame belongs to ${cluster.members[0]} alone, but the feature match preferred ${topId}`,
        );
  const contrast = localContrast(canvas, PRINTING_WIDTH, PRINTING_HEIGHT, {
    blur: true,
    radius: 7,
  });
  const found: Array<{
    x: number;
    y: number;
    dx: number;
    dy: number;
    error: number;
  }> = [];
  cluster.controls.forEach((tile, position) => {
    const offset = position * TILE_VALUES;
    const errors: number[] = [];
    let best = Infinity,
      bestX = 0,
      bestY = 0;
    for (let dy = -CONTROL_SHIFT; dy <= CONTROL_SHIFT; dy++)
      for (let dx = -CONTROL_SHIFT; dx <= CONTROL_SHIFT; dx++) {
        const error = tileError(
          contrast,
          tile,
          dx,
          dy,
          cluster.controlData,
          offset,
        );
        errors.push(error);
        if (error < best) {
          best = error;
          bestX = dx;
          bestY = dy;
        }
      }
    if (best < 0.5 * median(errors))
      found.push({
        x: (tile % TILE_COLUMNS) * TILE + TILE / 2,
        y: Math.floor(tile / TILE_COLUMNS) * TILE + TILE / 2,
        dx: bestX,
        dy: bestY,
        error: best,
      });
  });
  const fitted = fitShifts(found, 1.5, true);
  alignment.controls = cluster.controls.length;
  alignment.usable = fitted?.kept.length ?? found.length;
  if (!fitted)
    return finish(
      null,
      `the printing check could not align the card: ${found.length} of ${cluster.controls.length} control regions matched`,
    );
  const { model, kept } = fitted;
  alignment.noise = median(kept.map((point) => point.error));
  const predict = (x: number, y: number) => {
    const base = model(x, y);
    const near = [...kept]
      .sort(
        (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
      )
      .slice(0, 4)
      .filter((point) => Math.hypot(point.x - x, point.y - y) < 160);
    if (!near.length) return base;
    return {
      dx:
        base.dx +
        median(near.map((point) => point.dx - model(point.x, point.y).dx)),
      dy:
        base.dy +
        median(near.map((point) => point.dy - model(point.x, point.y).dy)),
    };
  };
  const count = cluster.members.length;
  const centers = cluster.tiles.map((tile) => {
    const predicted = predict(
      (tile % TILE_COLUMNS) * TILE + TILE / 2,
      Math.floor(tile / TILE_COLUMNS) * TILE + TILE / 2,
    );
    return { x: Math.round(predicted.dx), y: Math.round(predicted.dy) };
  });
  const measure = (member: number, radius: number) => {
    const values = new Float64Array(cluster.tiles.length);
    cluster.tiles.forEach((tile, position) => {
      let best = Infinity;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++)
          best = Math.min(
            best,
            tileError(
              contrast,
              tile,
              centers[position]!.x + dx,
              centers[position]!.y + dy,
              cluster.tileData,
              (member * cluster.tiles.length + position) * TILE_VALUES,
            ),
          );
      values[position] = best;
    });
    return values;
  };
  const pair = (a: number, b: number) => {
    const low = Math.min(a, b),
      high = Math.max(a, b);
    return cluster.separating[
      low * count - (low * (low + 1)) / 2 + high - low - 1
    ]!;
  };
  const mean = (values: Float64Array, positions: number[]) =>
    positions.reduce((sum, position) => sum + values[position]!, 0) /
    positions.length;
  const rank = (errors: Float64Array[], contenders: number[]) => {
    const totals = cluster.members.map(() => Number.NaN);
    for (const member of contenders) totals[member] = 0;
    cluster.tiles.forEach((_, position) => {
      const middle = median(
        contenders.map((member) => errors[member]![position]!),
      );
      for (const member of contenders)
        totals[member]! += errors[member]![position]! - middle;
    });
    return {
      totals,
      best: contenders.reduce((a, b) => (totals[b]! < totals[a]! ? b : a)),
    };
  };
  const everyone = cluster.members.map((_, member) => member);
  const errors = everyone.map((member) => measure(member, 0));
  const leading = rank(errors, everyone).best;
  cluster.tiles.forEach((tile, position) => {
    let best = Infinity,
      bestX = 0,
      bestY = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const error = tileError(
          contrast,
          tile,
          centers[position]!.x + dx,
          centers[position]!.y + dy,
          cluster.tileData,
          (leading * cluster.tiles.length + position) * TILE_VALUES,
        );
        if (error < best) {
          best = error;
          bestX = dx;
          bestY = dy;
        }
      }
    centers[position]!.x += bestX;
    centers[position]!.y += bestY;
  });
  for (const member of everyone) errors[member] = measure(member, 0);
  const first = rank(errors, everyone);
  const contenders = everyone.filter((member) => {
    if (member === first.best) return true;
    const positions = pair(first.best, member);
    if (!positions.length) return true;
    const own = mean(errors[first.best]!, positions),
      other = mean(errors[member]!, positions);
    return other - own < 4 * PAIR_GAP || other < 2 * PAIR_RATIO * own;
  });
  for (const member of contenders) errors[member] = measure(member, 1);
  const { totals, best } = rank(errors, contenders);
  const marks = [
    ...new Set(
      cluster.members.flatMap((_, member) =>
        member === best ? [] : pair(best, member),
      ),
    ),
  ];
  const allowed = Math.max(MAX_MARK_ERROR, MARK_NOISE_RATIO * alignment.noise);
  for (const member of members)
    if (member.cluster === clusterIndex) {
      const index = cluster.members.indexOf(member.scryfallId);
      member.fine = Number.isNaN(totals[index]!) ? null : totals[index]!;
      const positions = index === best ? marks : pair(best, index);
      member.markError = positions.length
        ? mean(errors[index]!, positions)
        : null;
      member.unexplained = contenders.includes(index)
        ? errors[index]!.filter((error) => error > allowed).length
        : null;
    }
  const winner = cluster.members[best]!;
  for (let member = 0; member < count; member++) {
    if (member === best) continue;
    const positions = pair(best, member);
    const rival = cluster.members[member]!;
    if (!positions.length)
      return finish(
        null,
        `same-art printings ${winner} and ${rival} show no visible difference`,
      );
    const own = mean(errors[best]!, positions),
      other = mean(errors[member]!, positions);
    if (other - own < PAIR_GAP || other < PAIR_RATIO * own)
      return finish(
        null,
        `same-art printings too close: ${winner} has mark error ${own.toFixed(3)} and ${rival} has ${other.toFixed(3)}`,
      );
  }
  const markError = mean(errors[best]!, marks);
  if (markError > allowed)
    return finish(
      null,
      `printing marks do not match ${winner} closely: error ${markError.toFixed(3)} above ${allowed.toFixed(3)}`,
    );
  const unexplained = errors[best]!.filter((error) => error > allowed).length;
  if (unexplained > MAX_UNEXPLAINED_TILES)
    return finish(
      null,
      `${unexplained} regions where same-art printings differ do not match ${winner} closely`,
    );
  return finish(winner, null);
}
