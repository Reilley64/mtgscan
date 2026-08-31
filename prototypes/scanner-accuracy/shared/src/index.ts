import { z } from "zod";

export const FinishSchema = z.enum(["nonfoil", "foil", "etched", "unknown"]);
export type Finish = z.infer<typeof FinishSchema>;

export const BenchmarkManifestEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scryfallId: z.string().uuid(),
  set: z.string().min(1),
  collectorNumber: z.string().min(1),
  language: z.string().min(1).default("en"),
  groundTruthFinish: FinishSchema.optional(),
});
export type BenchmarkManifestEntry = z.infer<
  typeof BenchmarkManifestEntrySchema
>;
export const BenchmarkManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  entries: z.array(BenchmarkManifestEntrySchema).min(1).max(240),
});
export type BenchmarkManifest = z.infer<typeof BenchmarkManifestSchema>;

export const CaptureSchema = z.object({
  id: z.string(),
  kind: z.enum(["still", "guided-tilt-video"]),
  mimeType: z.enum(["image/jpeg", "video/mp4", "video/quicktime"]),
  base64: z.string().min(1),
  quality: z.number().min(0).max(1).optional(),
});
export const RecognitionRequestSchema = z.object({
  sessionId: z.string().min(1),
  scanId: z.string().min(1),
  capturedAt: z.string().datetime(),
  captures: z.array(CaptureSchema).min(1).max(4),
});
export type RecognitionRequest = z.infer<typeof RecognitionRequestSchema>;

export const EvidenceSchema = z.object({
  strategy: z.enum(["image-distance", "ocr", "finish"]),
  status: z.enum(["available", "unavailable", "error"]),
  score: z.number().min(0).max(1).optional(),
  detail: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;
export const CandidateSchema = z.object({
  scryfallId: z.string().uuid(),
  oracleId: z.string().uuid().optional(),
  name: z.string(),
  set: z.string(),
  collectorNumber: z.string(),
  language: z.string(),
  finishes: z.array(FinishSchema),
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceSchema),
});
export type Candidate = z.infer<typeof CandidateSchema>;
export const AbstentionSchema = z.object({
  abstained: z.boolean(),
  reasons: z.array(z.string()),
});
export const RecognitionResponseSchema = z.object({
  sessionId: z.string(),
  scanId: z.string(),
  latencyMs: z.number().nonnegative(),
  candidates: z.array(CandidateSchema).max(10),
  abstention: AbstentionSchema,
  autoAcceptedScryfallId: z.string().uuid().nullable(),
});
export type RecognitionResponse = z.infer<typeof RecognitionResponseSchema>;

export const VariantSelectionSchema = z.object({
  selectedScryfallId: z.string().uuid(),
  language: z.string().min(1),
  finish: FinishSchema,
});
export const CorrectionSchema = VariantSelectionSchema.extend({
  changedFromProposal: z.boolean(),
});
export type Correction = z.infer<typeof CorrectionSchema>;
export const OutcomeSchema = z.object({
  sessionId: z.string(),
  scanId: z.string(),
  recognition: RecognitionResponseSchema,
  correction: CorrectionSchema,
  groundTruth: VariantSelectionSchema.optional(),
  scanStartedAt: z.string().datetime(),
  scanCompletedAt: z.string().datetime(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

export const ReportSchema = z.object({
  scans: z.number().int().nonnegative(),
  identityTop1: z.number().nullable(),
  identityTop3: z.number().nullable(),
  exactPrintingAccuracy: z.number().nullable(),
  falseAutoAcceptRate: z.number().nullable(),
  autoAcceptCoverage: z.number().nullable(),
  correctionRate: z.number().nullable(),
  latencyMs: z.object({
    p50: z.number().nullable(),
    p95: z.number().nullable(),
  }),
  cardsPerMinute: z.number().nullable(),
  duplicateDetection: z.literal("unavailable"),
  missedChangeDetection: z.literal("unavailable"),
  finishAccuracy: z.number().nullable(),
  finishCoverage: z.number().nullable(),
  finishConfusion: z
    .record(
      FinishSchema,
      z.record(FinishSchema, z.number().int().nonnegative()),
    )
    .nullable(),
  notes: z.array(z.string()),
});
export type Report = z.infer<typeof ReportSchema>;
