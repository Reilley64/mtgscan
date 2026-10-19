import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { importClientFromEnvironment } from '../import/import-client';
import { pullTrainingCrops } from './pull';

const usage = `Usage:
  bun crops/main.ts pull [--into <dir>]`;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    into: { type: 'string', default: join(homedir(), 'Library', 'Caches', 'mtgscan', 'training-crops') },
  },
});

if (positionals.length !== 1 || positionals[0] !== 'pull') {
  console.error(usage);
  process.exit(2);
}

try {
  await pullTrainingCrops(importClientFromEnvironment(), values.into);
} catch (error) {
  console.error(error);
  process.exit(1);
}
