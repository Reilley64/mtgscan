import { afterEach, describe, expect, it } from "vitest";
import {
  isNotACard,
  parseRecognitionResponse,
  recognitionConfig,
} from "../src/recognition/recognitionClient";

const candidate = {
  scryfallId: "211a1d86-7257-4621-ae05-c2b235c063f0",
  oracleId: "0bc7f093-bef0-4f1a-852c-4b75ebf54838",
  name: "Arcane Signet",
  set: "dsc",
  collectorNumber: "92",
  score: 0.93,
};

const response = (decision: unknown, candidates: unknown[] = [candidate]) => ({
  scanId: "session-1",
  serviceLatencyMs: 412,
  stageMs: { decode: 40, rectify: 20, rank: 30, rerank: 300 },
  candidates,
  decision,
});

describe("recognition response", () => {
  it("reads an accepted printing", () => {
    expect(
      parseRecognitionResponse(
        response({
          accepted: true,
          scryfallId: candidate.scryfallId,
          reasons: [],
        }),
      ),
    ).toEqual({
      scanId: "session-1",
      serviceLatencyMs: 412,
      candidates: [candidate],
      accepted: true,
      acceptedScryfallId: candidate.scryfallId,
      reasons: [],
    });
  });

  it("keeps an abstention with its reasons", () => {
    expect(
      parseRecognitionResponse(
        response({
          accepted: false,
          scryfallId: null,
          reasons: ["same-name printings too close"],
        }),
      ),
    ).toMatchObject({
      accepted: false,
      acceptedScryfallId: null,
      reasons: ["same-name printings too close"],
    });
  });

  it("rejects an accepted decision without a printing", () => {
    expect(
      parseRecognitionResponse(
        response({ accepted: true, scryfallId: null, reasons: [] }),
      ),
    ).toBeNull();
  });

  it("rejects malformed candidates and missing decisions", () => {
    expect(
      parseRecognitionResponse(
        response({ accepted: false, scryfallId: null, reasons: [] }, [
          { ...candidate, score: "high" },
        ]),
      ),
    ).toBeNull();
    expect(parseRecognitionResponse({ ...response(null) })).toBeNull();
    expect(parseRecognitionResponse("ok")).toBeNull();
  });
});

describe("not-a-card reasons", () => {
  it("recognizes the geometric and the catalog recognizer reasons", () => {
    expect(isNotACard(["no candidate has a plausible card homography"])).toBe(
      true,
    );
    expect(
      isNotACard(["not a card: best image similarity 0.410 is below 0.500"]),
    ).toBe(true);
    expect(
      isNotACard(["2 printings share this art and no collector line was read"]),
    ).toBe(false);
  });
});

describe("recognition settings", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("uses the service unless the device recognizer is selected", () => {
    process.env.EXPO_PUBLIC_RECOGNITION_URL = "http://192.168.1.2:4317/";
    process.env.EXPO_PUBLIC_RECOGNITION_TOKEN = "token";
    delete process.env.EXPO_PUBLIC_RECOGNIZER;
    expect(recognitionConfig()).toEqual({
      url: "http://192.168.1.2:4317",
      token: "token",
      mode: "service",
    });
    process.env.EXPO_PUBLIC_RECOGNIZER = "device";
    expect(recognitionConfig()?.mode).toBe("device");
  });
});
