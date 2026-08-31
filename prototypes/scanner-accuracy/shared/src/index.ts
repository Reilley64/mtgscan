import { z } from "zod";

export const FinishSchema = z.enum(["nonfoil", "foil", "etched", "unknown"]);
export type Finish = z.infer<typeof FinishSchema>;
export const PrototypeRunIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "use only letters, numbers, underscores, and hyphens",
  );
export const StrategySchema = z.enum(["image-only", "ocr-only", "hybrid"]);
export type Strategy = z.infer<typeof StrategySchema>;

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

export const StillCaptureSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("still"),
  mimeType: z.literal("image/jpeg"),
  base64: z.string().min(1),
  quality: z.number().min(0).max(1).optional(),
});
export const TiltCaptureSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("guided-tilt-video"),
  mimeType: z.enum(["video/mp4", "video/quicktime"]),
  base64: z.string().min(1),
});
export const CaptureSchema = z.union([StillCaptureSchema, TiltCaptureSchema]);
export const RecognitionRequestSchema = z.object({
  sessionId: PrototypeRunIdSchema,
  scanId: PrototypeRunIdSchema,
  capturedAt: z.string().datetime(),
  captures: z
    .tuple([StillCaptureSchema, StillCaptureSchema, StillCaptureSchema])
    .rest(TiltCaptureSchema)
    .refine(
      (captures) => captures.length <= 4,
      "exactly three stills followed by at most one tilt video are required",
    ),
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
export const StrategyResultSchema = z.object({
  strategy: StrategySchema,
  candidates: z.array(CandidateSchema).max(10),
  abstention: AbstentionSchema,
  autoAcceptedScryfallId: z.string().uuid().nullable(),
});
export type StrategyResult = z.infer<typeof StrategyResultSchema>;
export const RecognitionResponseSchema = z.object({
  sessionId: PrototypeRunIdSchema,
  scanId: PrototypeRunIdSchema,
  serviceLatencyMs: z.number().nonnegative(),
  results: z.array(StrategyResultSchema).length(3),
});
export type RecognitionResponse = z.infer<typeof RecognitionResponseSchema>;
export const VariantSelectionSchema = z.object({
  selectedScryfallId: z.string().uuid(),
  language: z.string().min(1),
  finish: FinishSchema,
});
export type VariantSelection = z.infer<typeof VariantSelectionSchema>;
export const OutcomeSubmissionSchema = z
  .object({
    sessionId: PrototypeRunIdSchema,
    scanId: PrototypeRunIdSchema,
    selected: VariantSelectionSchema,
    groundTruth: VariantSelectionSchema.optional(),
    scanStartedAt: z.string().datetime(),
    scanCompletedAt: z.string().datetime(),
    endToEndProposalLatencyMs: z.number().finite().nonnegative().max(300_000),
  })
  .refine(
    (value) =>
      Date.parse(value.scanCompletedAt) >= Date.parse(value.scanStartedAt),
    {
      message: "scanCompletedAt must not precede scanStartedAt",
      path: ["scanCompletedAt"],
    },
  );
export type OutcomeSubmission = z.infer<typeof OutcomeSubmissionSchema>;
export const CorrectionSchema = VariantSelectionSchema.extend({
  changedFromProposal: z.boolean(),
});
export type Correction = z.infer<typeof CorrectionSchema>;
export const OutcomeSchema = z.object({
  sessionId: PrototypeRunIdSchema,
  scanId: PrototypeRunIdSchema,
  recognition: RecognitionResponseSchema,
  correction: CorrectionSchema,
  groundTruth: VariantSelectionSchema.optional(),
  scanStartedAt: z.string().datetime(),
  scanCompletedAt: z.string().datetime(),
  endToEndProposalLatencyMs: z.number().nonnegative(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;
export const StrategyMetricsSchema = z.object({
  identityTop1: z.number().nullable(),
  identityTop3: z.number().nullable(),
  scryfallPrintingAccuracy: z.number().nullable(),
  languageAccuracy: z.number().nullable(),
  falseAutoAcceptRate: z.number().nullable(),
  falseAutoAcceptsPerThousandPresentations: z.number().nullable(),
  autoAcceptCoverage: z.number().nullable(),
  correctionRate: z.number().nullable(),
});
export const ReportSchema = z.object({
  scans: z.number().int().nonnegative(),
  strategies: z.record(StrategySchema, StrategyMetricsSchema),
  latencyMs: z.object({
    service: z.object({
      p50: z.number().nullable(),
      p95: z.number().nullable(),
    }),
    endToEndProposal: z.object({
      p50: z.number().nullable(),
      p95: z.number().nullable(),
    }),
  }),
  cardsPerMinute: z.number().nullable(),
  duplicateDetection: z.literal("unavailable"),
  missedChangeDetection: z.literal("unavailable"),
  finishAccuracy: z.literal("unavailable"),
  physicalVariantAccuracy: z.literal("unavailable"),
  notes: z.array(z.string()),
});
export type Report = z.infer<typeof ReportSchema>;
