import { describe, expect, it } from "vitest";
import { recognize } from "../src/recognizer.js";
import type { RecognitionRequest } from "@scanner-accuracy/shared";

describe("recognizer capture guard", () => {
  it("validates all decoded capture sizes before persistence", async () => {
    const tooLarge = Buffer.alloc(12_000_001).toString("base64");
    const request = {
      sessionId: "guard",
      scanId: "guard",
      capturedAt: "2025-01-01T00:00:00.000Z",
      captures: [
        { id: "1", kind: "still", mimeType: "image/jpeg", base64: tooLarge },
        { id: "2", kind: "still", mimeType: "image/jpeg", base64: "YQ==" },
        { id: "3", kind: "still", mimeType: "image/jpeg", base64: "YQ==" },
      ],
    } as RecognitionRequest;
    await expect(recognize(request, [])).rejects.toThrow("exceeds");
  });

  it("rejects content that only claims to be JPEG before persistence", async () => {
    const request = {
      sessionId: "guard",
      scanId: "mime",
      capturedAt: "2025-01-01T00:00:00.000Z",
      captures: ["1", "2", "3"].map((id) => ({
        id,
        kind: "still" as const,
        mimeType: "image/jpeg" as const,
        base64: "bm90LWEtanBlZw==",
      })),
    } as RecognitionRequest;
    await expect(recognize(request, [])).rejects.toThrow("must be JPEG");
  });
});
