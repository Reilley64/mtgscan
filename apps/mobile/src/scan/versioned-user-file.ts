import { File, Paths } from 'expo-file-system';

type SavedContent = { formatVersion?: unknown } & Record<string, unknown>;

export function versionedUserFile(name: string, userId: string, formatVersion: number) {
  const file = new File(Paths.document, `${name}-${userId}.json`);
  return {
    async read<T>(loaded: (saved: SavedContent) => T | null): Promise<T | null> {
      if (!file.exists) {
        return null;
      }
      try {
        return loaded(JSON.parse(await file.text()));
      } catch {
        return null;
      }
    },
    write(content: object) {
      file.write(JSON.stringify({ formatVersion, ...content }));
    },
  };
}
