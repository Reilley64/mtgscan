import path from "node:path";
import { fileURLToPath } from "node:url";
const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
export const prototypeRoot = path.resolve(serviceDirectory, "../..");
export const dataRoot = process.env.PROTOTYPE_DATA_DIR
  ? path.resolve(process.env.PROTOTYPE_DATA_DIR)
  : path.join(prototypeRoot, ".prototype-data");
export const defaultManifestPath = path.join(
  prototypeRoot,
  "sample/kill-test-manifest.json",
);
export const fullManifestPath = path.join(
  prototypeRoot,
  "sample/benchmark-manifest.json",
);
