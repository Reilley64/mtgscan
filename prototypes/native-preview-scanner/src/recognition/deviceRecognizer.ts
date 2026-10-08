import MtgCatalogRecognizer from "../../modules/mtg-catalog-recognizer";
import {
  parseRecognitionResponse,
  type CardQuad,
  type RecognitionConfig,
  type RecognitionResult,
} from "./recognitionClient";

export const PARITY_SAMPLE_COUNT = 24;

let preparation: Promise<void> | null = null;

function logEvent(event: string, detail: Record<string, unknown>) {
  console.log(
    "NATIVE_PREVIEW_EVENT " +
      JSON.stringify({ event, atMs: Date.now(), ...detail }),
  );
}

export function prepareDeviceRecognizer(
  config: RecognitionConfig,
): Promise<void> {
  preparation ??= (async () => {
    const prepared = await MtgCatalogRecognizer.prepare(
      config.url,
      config.token,
    );
    logEvent("device-recognizer-ready", prepared);
    const parity = await MtgCatalogRecognizer.checkParity(
      config.url,
      config.token,
      PARITY_SAMPLE_COUNT,
    );
    logEvent("device-feature-print-parity", parity);
  })().catch((error: unknown) => {
    preparation = null;
    logEvent("device-recognizer-failure", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  });
  return preparation;
}

export async function recognizeOnDevice(
  config: RecognitionConfig,
  photoPath: string,
  quad: CardQuad,
  scanId: string,
): Promise<RecognitionResult> {
  await prepareDeviceRecognizer(config);
  const { cropJpegBase64, ...recognition } =
    await MtgCatalogRecognizer.recognize(
      photoPath,
      [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map(
        (point) => [point.x, point.y],
      ),
    );
  const result = parseRecognitionResponse({
    scanId,
    serviceLatencyMs: recognition.totalMs,
    ...recognition,
    decision: {
      ...recognition.decision,
      scryfallId: recognition.decision.scryfallId ?? null,
    },
  });
  if (result === null) throw new Error("invalid device recognition");
  logEvent("device-recognition", {
    scanId,
    totalMs: recognition.totalMs,
    stageMs: recognition.stageMs,
    rotation: recognition.rotation,
    setCode: recognition.reading.setCode ?? null,
    collectorNumber: recognition.reading.collectorNumber ?? null,
  });
  void fetch(`${config.url}/device-recognitions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scanId, recognition, cropJpegBase64 }),
  }).catch((error: unknown) =>
    logEvent("device-audit-upload-failure", {
      scanId,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  return result;
}
