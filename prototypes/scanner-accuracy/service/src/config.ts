import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
export const prototypeRoot = path.resolve(serviceDirectory, "../..");
export const dataRoot = process.env.PROTOTYPE_DATA_DIR
  ? path.resolve(process.env.PROTOTYPE_DATA_DIR)
  : path.join(prototypeRoot, ".prototype-data");
export const catalogRoot = path.join(dataRoot, "catalog");
export const catalogRecognizerRoot = path.resolve(
  prototypeRoot,
  "../catalog-recognizer",
);
export const catalogRecognizerBinary = process.env.CATALOG_RECOGNIZER_BIN
  ? path.resolve(process.env.CATALOG_RECOGNIZER_BIN)
  : path.join(catalogRecognizerRoot, ".build", "mtg-catalog-recognizer");
export const catalogDirectory = process.env.CATALOG_DIR
  ? path.resolve(process.env.CATALOG_DIR)
  : path.join(catalogRecognizerRoot, ".data", "catalog");
export const defaultManifestPath = path.join(
  prototypeRoot,
  "sample/kill-test-manifest.json",
);
export const fullManifestPath = path.join(
  prototypeRoot,
  "sample/benchmark-manifest.json",
);

export function prototypeToken(): string {
  const token = process.env.PROTOTYPE_TOKEN;
  if (
    !token ||
    token.length < 32 ||
    token === "replace-with-a-long-random-per-run-token"
  )
    throw new Error(
      "PROTOTYPE_TOKEN must be a unique random value of at least 32 characters",
    );
  return token;
}
