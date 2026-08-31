import fs from "node:fs/promises";
import path from "node:path";
import {
  OutcomeSchema,
  OutcomeSubmissionSchema,
  ReportSchema,
  type Outcome,
  type OutcomeSubmission,
  type RecognitionResponse,
  type Report,
} from "@scanner-accuracy/shared";
import { dataRoot } from "./config.js";
import { loadCorpus } from "./corpus.js";
import { aggregateReport } from "./metrics.js";
const outcomesFile = path.join(dataRoot, "outcomes.ndjson");
const outcomesInFlight = new Set<string>();
const safe = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
const recognitionFile = (sessionId: string, scanId: string) =>
  path.join(dataRoot, "recognitions", safe(sessionId), `${safe(scanId)}.json`);
export async function persistRecognition(value: RecognitionResponse) {
  const file = recognitionFile(value.sessionId, value.scanId);
  try {
    await fs.access(file);
    throw new Error("recognition already exists for this session and scan");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify({ recognition: value, consumed: false }, null, 2),
    { flag: "wx" },
  );
}

export function validateCorpusSelection(
  corpus: Awaited<ReturnType<typeof loadCorpus>>,
  selection: { selectedScryfallId: string; language: string; finish: string },
) {
  const card = corpus.find(
    (item) => item.scryfallId === selection.selectedScryfallId,
  );
  if (!card)
    throw new Error(
      "selected or ground-truth Scryfall ID is not in the active corpus",
    );
  if (selection.language !== card.language)
    throw new Error("selection language does not match active corpus");
  if (
    selection.finish !== "unknown" &&
    !card.finishes.includes(selection.finish as never)
  )
    throw new Error("selection finish is not allowed by the active corpus");
}
async function recordOutcomeOnce(value: unknown): Promise<Outcome> {
  const submission: OutcomeSubmission = OutcomeSubmissionSchema.parse(value);
  const file = recognitionFile(submission.sessionId, submission.scanId);
  let stored: { recognition: RecognitionResponse; consumed: boolean };
  try {
    stored = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw new Error("recognition is missing or was not issued by this service");
  }
  if (stored.consumed)
    throw new Error("recognition outcome has already been submitted");
  const corpus = await loadCorpus();
  validateCorpusSelection(corpus, submission.selected);
  if (submission.groundTruth)
    validateCorpusSelection(corpus, submission.groundTruth);
  const hybrid = stored.recognition.results.find(
    (result) => result.strategy === "hybrid",
  );
  const proposal = hybrid?.candidates[0];
  const outcome: Outcome = {
    sessionId: submission.sessionId,
    scanId: submission.scanId,
    recognition: stored.recognition,
    correction: {
      ...submission.selected,
      changedFromProposal:
        submission.selected.selectedScryfallId !== proposal?.scryfallId ||
        submission.selected.language !== proposal?.language ||
        submission.selected.finish !== "unknown",
    },
    groundTruth: submission.groundTruth,
    scanStartedAt: submission.scanStartedAt,
    scanCompletedAt: submission.scanCompletedAt,
    endToEndProposalLatencyMs: submission.endToEndProposalLatencyMs,
  };
  OutcomeSchema.parse(outcome);
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.appendFile(outcomesFile, `${JSON.stringify(outcome)}\n`);
  await fs.writeFile(
    file,
    JSON.stringify({ ...stored, consumed: true }, null, 2),
  );
  return outcome;
}
export async function recordOutcome(value: unknown): Promise<Outcome> {
  const submission = OutcomeSubmissionSchema.parse(value);
  const key = `${submission.sessionId}:${submission.scanId}`;
  if (outcomesInFlight.has(key))
    throw new Error("recognition outcome is already being submitted");
  outcomesInFlight.add(key);
  try {
    return await recordOutcomeOnce(submission);
  } finally {
    outcomesInFlight.delete(key);
  }
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
