import { nearestRank } from '../../../src/scan/capture-log';

export type Point = [x: number, y: number];

export function homography(from: Point[], to: Point[]) {
  const rows = from.flatMap(([x, y], index) => {
    const [u, v] = to[index];
    return [
      [x, y, 1, 0, 0, 0, -u * x, -u * y, u],
      [0, 0, 0, x, y, 1, -v * x, -v * y, v],
    ];
  });
  for (let column = 0; column < 8; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let row = 0; row < 8; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column] / rows[column][column];
      for (let entry = column; entry < 9; entry += 1) rows[row][entry] -= factor * rows[column][entry];
    }
  }
  const h = rows.map((row, index) => row[8] / row[index]);
  return ([x, y]: Point): Point => {
    const w = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  };
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function median(values: number[]) {
  return nearestRank([...values].sort((a, b) => a - b), 0.5);
}

export function cardCorners([width, height]: Point): Point[] {
  return [[0, 0], [width, 0], [width, height], [0, height]];
}

export function outlineOnCard(outline: Point[], trueCorners: Point[], cardMm: Point) {
  const card = cardCorners(cardMm);
  const onCard = outline.map(homography(trueCorners, card));
  return [0, 1, 2, 3]
    .map((shift) => card.map((_, corner) => onCard[(corner + shift) % 4]))
    .map((corners) => ({ corners, errorMm: Math.max(...corners.map((corner, index) => distance(corner, card[index]))) }))
    .reduce((best, candidate) => (candidate.errorMm < best.errorMm ? candidate : best));
}
