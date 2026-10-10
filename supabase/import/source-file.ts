export const importUserAgent = 'mtgscan-catalog-import/0.0 (+https://github.com/Reilley64/mtgscan)';

export function isUrl(location: string): boolean {
  return /^https?:\/\//.test(location);
}

export async function openLocation(location: string, headers: Record<string, string>): Promise<Response> {
  const response = isUrl(location) ? await fetch(location, { headers }) : new Response(Bun.file(location));
  if (!response.ok || !response.body) {
    throw new Error(`Could not read ${location}: HTTP ${response.status}`);
  }
  return response;
}
