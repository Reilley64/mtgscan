import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  catalogFilePath,
  DeviceRecognitionError,
  persistDeviceRecognition,
} from "../src/catalog-files.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

const options = { catalogDirectory: "/catalog", imagesDirectory: "/images" };

describe("catalog files", () => {
  it("maps only the gallery files and Scryfall image ids", () => {
    expect(catalogFilePath("/catalog/files/gallery.f16", options)).toBe(
      "/catalog/gallery.f16",
    );
    expect(
      catalogFilePath(
        "/catalog/images/211a1d86-7257-4621-ae05-c2b235c063f0.jpg",
        options,
      ),
    ).toBe("/images/211a1d86-7257-4621-ae05-c2b235c063f0.jpg");
    expect(
      catalogFilePath("/catalog/files/../secret.json", options),
    ).toBeNull();
    expect(catalogFilePath("/catalog/files/other.json", options)).toBeNull();
    expect(
      catalogFilePath("/catalog/images/../../etc.jpg", options),
    ).toBeNull();
  });

  it("keeps the device crop and one log line, and rejects bad input", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "device-recognitions-"),
    );
    roots.push(root);
    await persistDeviceRecognition(
      {
        scanId: "scan_1",
        recognition: { decision: { accepted: true }, totalMs: 120 },
        cropJpegBase64: Buffer.from("crop").toString("base64"),
      },
      root,
    );
    expect(
      (await fs.readFile(path.join(root, "crops", "scan_1.jpg"))).toString(),
    ).toBe("crop");
    const [line] = (
      await fs.readFile(path.join(root, "recognitions.ndjson"), "utf8")
    )
      .trim()
      .split("\n");
    expect(JSON.parse(line!)).toMatchObject({
      scanId: "scan_1",
      decision: { accepted: true },
      totalMs: 120,
    });
    await expect(
      persistDeviceRecognition(
        { scanId: "../x", recognition: {}, cropJpegBase64: "" },
        root,
      ),
    ).rejects.toBeInstanceOf(DeviceRecognitionError);
  });
});
