import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { featurePrintDimension } from './format';
import type { ImageCache } from './images';
import type { GalleryPrinting } from './printings';
import { type Recognizer, macOSMajor } from './recognizer';

type CacheIndex = {
  macOSMajor: string;
  featurePrintRevision: number;
  rows: { id: string; image: string }[];
};

export type FeaturePrints = {
  codes: Map<string, Uint8Array>;
  computed: number;
  reused: number;
};

async function cachedCodes(directory: string, recognizer: Recognizer): Promise<Map<string, { image: string; codes: Uint8Array }>> {
  const indexPath = join(directory, 'feature-prints.json');
  const codesPath = join(directory, 'feature-prints.i8');
  const cached = new Map<string, { image: string; codes: Uint8Array }>();
  if (!existsSync(indexPath) || !existsSync(codesPath)) {
    return cached;
  }
  const index = (await Bun.file(indexPath).json()) as CacheIndex;
  if (index.macOSMajor !== macOSMajor(recognizer.about.macOS) || index.featurePrintRevision !== recognizer.about.featurePrintRevision) {
    return cached;
  }
  const codes = new Uint8Array(await Bun.file(codesPath).arrayBuffer());
  if (codes.length !== index.rows.length * featurePrintDimension) {
    return cached;
  }
  index.rows.forEach((row, position) =>
    cached.set(row.id, {
      image: row.image,
      codes: codes.slice(position * featurePrintDimension, (position + 1) * featurePrintDimension),
    }),
  );
  return cached;
}

export async function featurePrints(
  directory: string,
  printings: GalleryPrinting[],
  images: ImageCache,
  recognizer: Recognizer,
): Promise<FeaturePrints> {
  const cached = await cachedCodes(directory, recognizer);
  const missing = printings.filter((printing) => cached.get(printing.printing.id)?.image !== printing.image);
  console.error(`Computing ${missing.length} feature prints. ${printings.length - missing.length} are cached.`);
  const computed = await recognizer.encode(missing.map((printing) => images.imageFile(printing.printing.id)));
  missing.forEach((printing, position) =>
    cached.set(printing.printing.id, {
      image: printing.image,
      codes: computed.slice(position * featurePrintDimension, (position + 1) * featurePrintDimension),
    }),
  );
  const index: CacheIndex = {
    macOSMajor: macOSMajor(recognizer.about.macOS),
    featurePrintRevision: recognizer.about.featurePrintRevision,
    rows: printings.map((printing) => ({ id: printing.printing.id, image: printing.image })),
  };
  const all = new Uint8Array(printings.length * featurePrintDimension);
  printings.forEach((printing, position) => all.set(cached.get(printing.printing.id)!.codes, position * featurePrintDimension));
  await writeFile(join(directory, 'feature-prints.i8'), all);
  await writeFile(join(directory, 'feature-prints.json'), JSON.stringify(index));
  return {
    codes: new Map(printings.map((printing) => [printing.printing.id, cached.get(printing.printing.id)!.codes])),
    computed: missing.length,
    reused: printings.length - missing.length,
  };
}
