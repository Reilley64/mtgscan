import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ImportClient } from '../import/import-run';
import type { ManifestPart } from './format';
import { downloadObject } from './storage';

export function versionDirectory(workDirectory: string, version: string): string {
  return join(workDirectory, 'versions', version);
}

export async function localPartBytes(
  client: () => ImportClient,
  workDirectory: string,
  version: string,
  part: ManifestPart,
): Promise<Uint8Array> {
  const directory = versionDirectory(workDirectory, version);
  const file = join(directory, part.name);
  if (existsSync(file)) {
    return new Uint8Array(await Bun.file(file).arrayBuffer());
  }
  console.error(`Downloading ${version}/${part.name} from Storage.`);
  const bytes = await downloadObject(client(), `${version}/${part.name}`);
  await mkdir(directory, { recursive: true });
  await writeFile(file, bytes);
  return bytes;
}
