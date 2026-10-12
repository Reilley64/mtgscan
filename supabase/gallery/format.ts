import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

export const featurePrintDimension = 768;
export const galleryFormatVersion = 1;
export const maxPartBytes = 50_000_000;
export const addOnLimit = 0.1;
const maxRawPartBytes = 45_000_000;

export type PartKind = 'gallery' | 'printing_list';

export type PrintingListRow = {
  id: string;
  oracleId: string;
  illustrationId: string | null;
  name: string;
  faceNames: string[];
  set: string;
  collectorNumber: string;
  frame: string;
  finishes: string[];
  basicLand: boolean;
};

export type ManifestPart = {
  name: string;
  kind: PartKind;
  addOn: number;
  firstRow: number;
  rowCount: number;
  compressedBytes: number;
  rawBytes: number;
  sha256: string;
};

export type BuiltWith = {
  macOS: string;
  recognizerCommit: string;
  machine: string;
};

export type Manifest = {
  formatVersion: number;
  version: string;
  builtAt: string;
  featurePrint: { request: string; revision: number; dimension: number };
  encoding: { type: 'int8'; scale: 'per_vector' };
  rows: number;
  scryfallSnapshot: string;
  cardCatalogSnapshot: string;
  builtWith: BuiltWith;
  parts: ManifestPart[];
};

export type GalleryRow = {
  printing: PrintingListRow;
  codes: Uint8Array;
};

export type Part = ManifestPart & { bytes: Uint8Array };

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function newVersionId(date: Date = new Date()): string {
  const day = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `${day}-${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`;
}

function partPrefix(addOn: number): string {
  return addOn === 0 ? 'base' : `add-on-${addOn}`;
}

function encodedPart(name: string, kind: PartKind, addOn: number, firstRow: number, rowCount: number, raw: Uint8Array): Part {
  const bytes = new Uint8Array(deflateSync(raw, { level: 9 }));
  if (bytes.length >= maxPartBytes) {
    throw new Error(`${name} is ${bytes.length} bytes, over the ${maxPartBytes} byte upload limit`);
  }
  return { name, kind, addOn, firstRow, rowCount, compressedBytes: bytes.length, rawBytes: raw.length, sha256: sha256(bytes), bytes };
}

function splitRows<Item>(items: Item[], rawBytes: number): Item[][] {
  const count = Math.max(1, Math.ceil(rawBytes / maxRawPartBytes));
  const size = Math.ceil(items.length / count);
  return Array.from({ length: count }, (_, index) => items.slice(index * size, (index + 1) * size)).filter(
    (chunk) => chunk.length > 0,
  );
}

export function galleryParts(addOn: number, firstRow: number, rows: GalleryRow[]): Part[] {
  const parts: Part[] = [];
  let row = firstRow;
  splitRows(rows, rows.length * featurePrintDimension).forEach((chunk, index) => {
    const raw = new Uint8Array(chunk.length * featurePrintDimension);
    chunk.forEach((item, position) => raw.set(item.codes, position * featurePrintDimension));
    parts.push(encodedPart(`${partPrefix(addOn)}-gallery-${index + 1}.zlib`, 'gallery', addOn, row, chunk.length, raw));
    row += chunk.length;
  });
  const printingList = new TextEncoder().encode(JSON.stringify(rows.map((item) => item.printing)));
  row = firstRow;
  splitRows(rows, printingList.length).forEach((chunk, index) => {
    const raw = new TextEncoder().encode(JSON.stringify(chunk.map((item) => item.printing)));
    parts.push(encodedPart(`${partPrefix(addOn)}-printing-list-${index + 1}.zlib`, 'printing_list', addOn, row, chunk.length, raw));
    row += chunk.length;
  });
  return parts;
}

export function verifiedPartBytes(part: ManifestPart, bytes: Uint8Array): Uint8Array {
  if (bytes.length !== part.compressedBytes || sha256(bytes) !== part.sha256) {
    throw new Error(`${part.name} does not match its SHA-256 in the manifest`);
  }
  const raw = new Uint8Array(inflateSync(bytes));
  if (raw.length !== part.rawBytes) {
    throw new Error(`${part.name} has ${raw.length} raw bytes, the manifest says ${part.rawBytes}`);
  }
  return raw;
}

export function installedRows(manifest: Manifest, partBytes: (part: ManifestPart) => Uint8Array): Map<string, GalleryRow> {
  const ordered = [...manifest.parts].sort((a, b) => a.addOn - b.addOn || a.firstRow - b.firstRow);
  const printings = ordered
    .filter((part) => part.kind === 'printing_list')
    .flatMap((part) => JSON.parse(new TextDecoder().decode(verifiedPartBytes(part, partBytes(part)))) as PrintingListRow[]);
  const codes = ordered
    .filter((part) => part.kind === 'gallery')
    .flatMap((part) => {
      const raw = verifiedPartBytes(part, partBytes(part));
      return Array.from({ length: part.rowCount }, (_, row) =>
        raw.subarray(row * featurePrintDimension, (row + 1) * featurePrintDimension),
      );
    });
  if (codes.length !== printings.length) {
    throw new Error(`Gallery version ${manifest.version} has ${codes.length} feature prints and ${printings.length} printing list rows`);
  }
  const rows = new Map<string, GalleryRow>();
  printings.forEach((printing, index) => rows.set(printing.id, { printing, codes: codes[index]! }));
  return rows;
}

export function partBytes(parts: ManifestPart[], kind?: PartKind): number {
  return parts.filter((part) => !kind || part.kind === kind).reduce((sum, part) => sum + part.compressedBytes, 0);
}

export function updateBytes(manifest: Manifest, installed: Manifest): number {
  return partBytes(manifest.parts.filter((part) => !installed.parts.some((earlier) => earlier.sha256 === part.sha256)));
}
