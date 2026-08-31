import path from "node:path";
import { cacheDefaultCardsBulkMetadata, prepareCorpus } from "./corpus.js";
import {
  defaultManifestPath,
  fullManifestPath,
  prototypeRoot,
} from "./config.js";
import { generateReport } from "./outcomes.js";
import {
  personalManifestPath,
  writePersonalManifest,
} from "./personal-manifest.js";
const [command, ...args] = process.argv.slice(2);
const valueAfter = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
if (command === "prepare") {
  const manifestPath = args.includes("--personal")
    ? personalManifestPath
    : args.includes("--benchmark")
      ? fullManifestPath
      : defaultManifestPath;
  const result = await prepareCorpus(manifestPath);
  const bulkMetadataFile =
    process.env.PREPARE_BULK === "1"
      ? await cacheDefaultCardsBulkMetadata()
      : null;
  console.log(
    JSON.stringify(
      {
        manifest: result.manifest,
        cards: result.cards.length,
        bulkMetadataFile,
      },
      null,
      2,
    ),
  );
} else if (command === "select-manifest") {
  const input = path.resolve(
    prototypeRoot,
    valueAfter("--input") ?? "../../current_collection.csv",
  );
  const size = Number(valueAfter("--size") ?? "40");
  console.log(
    JSON.stringify(await writePersonalManifest(input, size), null, 2),
  );
} else if (command === "report")
  console.log(JSON.stringify(await generateReport(), null, 2));
else {
  console.error(
    "Commands: corpus:prepare [--benchmark|--personal], select:manifest [--input path] [--size 30..50], report",
  );
  process.exitCode = 1;
}
