import fs from "node:fs/promises";
import path from "node:path";
import {
  OutcomeSchema,
  ReportSchema,
  type Outcome,
  type Report,
} from "@scanner-accuracy/shared";
import { dataRoot } from "./config.js";
import { loadCorpus } from "./corpus.js";
import { aggregateReport } from "./metrics.js";
const outcomesFile = path.join(dataRoot, "outcomes.ndjson");
export async function recordOutcome(value: unknown): Promise<Outcome> {
  const outcome = OutcomeSchema.parse(value);
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.appendFile(outcomesFile, `${JSON.stringify(outcome)}\n`);
  return outcome;
}
export async function readOutcomes(): Promise<Outcome[]> {
  try {
    return (await fs.readFile(outcomesFile, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => OutcomeSchema.parse(JSON.parse(line)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function generateReport(): Promise<{
  report: Report;
  file: string;
}> {
  const report = ReportSchema.parse(
    aggregateReport(await readOutcomes(), await loadCorpus()),
  );
  const reportDirectory = path.join(dataRoot, "reports");
  await fs.mkdir(reportDirectory, { recursive: true });
  const file = path.join(
    reportDirectory,
    `report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  await fs.writeFile(file, JSON.stringify(report, null, 2));
  await fs.writeFile(
    path.join(reportDirectory, "latest.json"),
    JSON.stringify(report, null, 2),
  );
  return { report, file };
}
