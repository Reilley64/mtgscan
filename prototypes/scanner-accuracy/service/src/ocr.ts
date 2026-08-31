import path from "node:path";
import sharp from "sharp";
import { dataRoot } from "./config.js";

function normalized(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}
export function tokenSimilarity(text: string, expected: string): number {
  const actual = new Set(normalized(text));
  const wanted = normalized(expected);
  return wanted.length
    ? wanted.filter((token) => actual.has(token)).length / wanted.length
    : 0;
}
export async function recognizeConstrainedText(
  buffer: Buffer,
): Promise<{ text?: string; unavailable?: string }> {
  if (process.env.OCR_ENABLED !== "1")
    return {
      unavailable:
        "OCR is installed but disabled; set OCR_ENABLED=1 to pay its CPU/startup cost.",
    };
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height)
      return { unavailable: "OCR could not read image dimensions." };
    const title = await sharp(buffer)
      .extract({
        left: 0,
        top: 0,
        width: metadata.width,
        height: Math.max(1, Math.floor(metadata.height * 0.18)),
      })
      .greyscale()
      .normalize()
      .png()
      .toBuffer();
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", undefined, {
      cachePath: path.join(dataRoot, "tesseract"),
    });
    try {
      const result = await worker.recognize(title);
      return { text: result.data.text.trim() };
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    return {
      unavailable: `OCR adapter error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
