import { describe, expect, it } from "vitest";
import {
  OutcomeSubmissionSchema,
  RecognitionRequestSchema,
} from "@scanner-accuracy/shared";
const still = {
  id: "a",
  kind: "still" as const,
  mimeType: "image/jpeg" as const,
  base64: "YQ==",
};
describe("fixed capture boundary", () =>
  it("requires exactly three JPEG stills", () => {
    const base = {
      sessionId: "s",
      scanId: "x",
      capturedAt: "2025-01-01T00:00:00.000Z",
    };
    expect(() =>
      RecognitionRequestSchema.parse({ ...base, captures: [still, still] }),
    ).toThrow();
    expect(() =>
      RecognitionRequestSchema.parse({
        ...base,
        captures: [still, still, still, still],
      }),
    ).toThrow();
    expect(() =>
      RecognitionRequestSchema.parse({
        ...base,
        captures: [still, still, still],
      }),
    ).not.toThrow();
  }));

describe("prototype run identifiers and timing", () => {
  it("rejects path-like identifiers", () => {
    expect(() =>
      RecognitionRequestSchema.parse({
        sessionId: "session/../collision",
        scanId: "scan",
        capturedAt: "2025-01-01T00:00:00.000Z",
        captures: [still, still, still],
      }),
    ).toThrow();
  });

  it("rejects a scan completion before its start", () => {
    expect(() =>
      OutcomeSubmissionSchema.parse({
        sessionId: "session",
        scanId: "scan",
        selected: {
          selectedScryfallId: "00000000-0000-4000-8000-000000000001",
          language: "en",
          finish: "unknown",
        },
        scanStartedAt: "2025-01-01T00:00:01.000Z",
        scanCompletedAt: "2025-01-01T00:00:00.000Z",
        endToEndProposalLatencyMs: 100,
      }),
    ).toThrow();
  });
});
