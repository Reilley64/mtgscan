import fs from "node:fs";
import fsp from "node:fs/promises";
import type http from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const catalogFiles = new Set(["catalog.json", "gallery.json", "gallery.f16"]);
const scryfallIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const scanIdPattern = /^[A-Za-z0-9_-]{1,80}$/;

export function catalogFilePath(
  url: string,
  options: { catalogDirectory: string; imagesDirectory: string },
): string | null {
  const file = /^\/catalog\/files\/([a-z0-9.]+)$/.exec(url)?.[1];
  if (file && catalogFiles.has(file))
    return path.join(options.catalogDirectory, file);
  const image = /^\/catalog\/images\/([0-9a-f-]+)\.jpg$/.exec(url)?.[1];
  if (image && scryfallIdPattern.test(image))
    return path.join(options.imagesDirectory, `${image}.jpg`);
  return null;
}

export async function sendFile(
  response: http.ServerResponse,
  file: string,
): Promise<boolean> {
  const stat = await fsp.stat(file).catch(() => null);
  if (!stat?.isFile()) return false;
  response.writeHead(200, {
    "Content-Type": file.endsWith(".json")
      ? "application/json"
      : file.endsWith(".jpg")
        ? "image/jpeg"
        : "application/octet-stream",
    "Content-Length": String(stat.size),
  });
  await pipeline(fs.createReadStream(file), response);
  return true;
}

export class DeviceRecognitionError extends Error {}

export async function persistDeviceRecognition(
  value: unknown,
  persistRoot: string,
) {
  if (typeof value !== "object" || value === null)
    throw new DeviceRecognitionError("body must be a JSON object");
  const record = value as Record<string, unknown>;
  if (typeof record.scanId !== "string" || !scanIdPattern.test(record.scanId))
    throw new DeviceRecognitionError("scanId must match [A-Za-z0-9_-]{1,80}");
  if (typeof record.recognition !== "object" || record.recognition === null)
    throw new DeviceRecognitionError("recognition must be an object");
  if (
    typeof record.cropJpegBase64 !== "string" ||
    !/^[A-Za-z0-9+/=]*$/.test(record.cropJpegBase64)
  )
    throw new DeviceRecognitionError("cropJpegBase64 must be base64");
  const crop = Buffer.from(record.cropJpegBase64, "base64");
  await fsp.mkdir(path.join(persistRoot, "crops"), { recursive: true });
  if (crop.length > 0)
    await fsp.writeFile(
      path.join(persistRoot, "crops", `${record.scanId}.jpg`),
      crop,
    );
  await fsp.appendFile(
    path.join(persistRoot, "recognitions.ndjson"),
    `${JSON.stringify({
      scanId: record.scanId,
      timestamp: new Date().toISOString(),
      ...(record.recognition as Record<string, unknown>),
    })}\n`,
  );
  return record.scanId;
}
