import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [expectedPath, actualPath, catalogArgument] = process.argv.slice(2);
if (!expectedPath || !actualPath) {
  console.error("usage: node evidence/check.mjs <expected.json> <actual.json> [catalog-dir]");
  process.exit(1);
}
const catalogDirectory = path.resolve(catalogArgument ?? path.join(projectRoot, ".data", "catalog"));
const readResult = async (file) => {
  const parsed = JSON.parse(await fs.readFile(file, "utf8"));
  return parsed.result ?? parsed;
};
const expected = await readResult(expectedPath);
const actual = await readResult(actualPath);
const catalog = JSON.parse(await fs.readFile(path.join(catalogDirectory, "catalog.json"), "utf8"));
const oracleById = new Map(catalog.map((printing) => [printing.id, printing.oracleId]));
const timingKeys = new Set(["p50Ms", "p95Ms"]);
const listKeys = new Set(["acceptReasons", "groups", "falseAcceptList", "acceptedRows", "scans"]);

const measures = (result) => {
  const accepts = result.scans
    ? result.scans.filter((scan) => scan.truth && scan.accepted).map((scan) => ({ input: scan.input, accepted: scan.accepted, truth: scan.truth }))
    : result.falseAcceptList;
  const wrongCard = accepts.filter((accept) => oracleById.get(accept.accepted) !== oracleById.get(accept.truth));
  const wrongPrintingOutsideCandidates = result.heldOut
    ? []
    : result.falseAcceptList.filter((accept) => !accept.truthInCandidates && oracleById.get(accept.accepted) === oracleById.get(accept.truth));
  return { wrongCard, wrongPrintingOutsideCandidates };
};

const gates = [];
const actualMeasures = measures(actual);
const expectedMeasures = measures(expected);
gates.push(["no wrong-card accepts", actualMeasures.wrongCard.length === 0, actualMeasures.wrongCard.length]);
gates.push(["no recognizer errors", actual.errors === 0, actual.errors]);
gates.push(["every non-card rejected", actual.nonCardsRejected === actual.nonCards, `${actual.nonCardsRejected} of ${actual.nonCards}`]);
if (!actual.heldOut) {
  gates.push([
    "wrong printings outside the candidates no more than expected",
    actualMeasures.wrongPrintingOutsideCandidates.length <= expectedMeasures.wrongPrintingOutsideCandidates.length,
    `${actualMeasures.wrongPrintingOutsideCandidates.length}, expected ${expectedMeasures.wrongPrintingOutsideCandidates.length}`,
  ]);
}
if (expected.falseAccepts === 0 && !expected.heldOut) gates.push(["no wrong-printing accepts", actual.falseAccepts === 0, actual.falseAccepts]);
if (expected.heldOut && expected.accepted === 0) gates.push(["no accepts with the true printing missing", actual.accepted === 0, actual.accepted]);

const totalChanges = Object.keys({ ...expected, ...actual })
  .filter((key) => !timingKeys.has(key) && !listKeys.has(key))
  .filter((key) => JSON.stringify(expected[key]) !== JSON.stringify(actual[key]))
  .map((key) => ({ measure: key, expected: expected[key], actual: actual[key] }));

const scanOutcomes = (result) => {
  if (result.scans) return new Map(result.scans.map((scan) => [scan.input, { top: scan.top, accepted: scan.accepted }]));
  return new Map(result.falseAcceptList.map((accept) => [accept.input, { accepted: accept.accepted }]));
};
const expectedScans = scanOutcomes(expected);
const actualScans = scanOutcomes(actual);
const comparable = Boolean(expected.scans) === Boolean(actual.scans);
const scanChanges = comparable
  ? [...new Set([...expectedScans.keys(), ...actualScans.keys()])]
      .filter((input) => JSON.stringify(expectedScans.get(input) ?? null) !== JSON.stringify(actualScans.get(input) ?? null))
      .map((input) => ({ input, expected: expectedScans.get(input) ?? null, actual: actualScans.get(input) ?? null }))
  : null;

const passed = gates.every(([, pass]) => pass);
console.log(
  JSON.stringify(
    {
      gates: gates.map(([gate, pass, value]) => ({ gate, pass, value })),
      wrongCardAccepts: actualMeasures.wrongCard,
      totalChanges,
      scanChanges: scanChanges ?? "not compared: run with --scans to match the expected file",
    },
    null,
    2,
  ),
);
process.exit(passed ? (totalChanges.length === 0 && scanChanges?.length === 0 ? 0 : 2) : 1);
