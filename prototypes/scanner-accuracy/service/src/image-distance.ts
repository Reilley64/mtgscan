import sharp from "sharp";

export async function normalizedCard(
  buffer: Buffer,
  guideCoverage = 1,
): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height)
    throw new Error("capture has no image dimensions");
  const aspect = 63 / 88;
  let width = metadata.width;
  let height = Math.round(width / aspect);
  if (height > metadata.height) {
    height = metadata.height;
    width = Math.round(height * aspect);
  }
  width = Math.max(1, Math.floor(width * guideCoverage));
  height = Math.max(1, Math.floor(height * guideCoverage));
  const left = Math.max(0, Math.floor((metadata.width - width) / 2));
  const top = Math.max(0, Math.floor((metadata.height - height) / 2));
  return sharp(buffer)
    .extract({ left, top, width, height })
    .rotate()
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function differenceHash(
  buffer: Buffer,
  guideCoverage = 1,
): Promise<string> {
  const raw = await sharp(await normalizedCard(buffer, guideCoverage))
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  let bits = "";
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits += raw[y * 9 + x]! > raw[y * 9 + x + 1]! ? "1" : "0";
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}
export function hashSimilarity(left: string, right: string): number {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`),
    different = 0;
  while (value) {
    different += Number(value & 1n);
    value >>= 1n;
  }
  return 1 - different / 64;
}
