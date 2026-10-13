let files = new Map<string, string>();

class FakeFile {
  readonly uri: string;

  constructor(directory: { uri: string }, name: string) {
    this.uri = `${directory.uri}${name}`;
  }

  get exists() {
    return files.has(this.uri);
  }

  async text() {
    const content = files.get(this.uri);
    if (content === undefined) {
      throw new Error(`No file at ${this.uri}`);
    }
    return content;
  }

  write(content: string) {
    files.set(this.uri, content);
  }
}

export const fakeFileSystem = {
  File: FakeFile,
  Paths: { document: { uri: 'file:///documents/' } },
};

export function resetFakeFileSystem() {
  files = new Map();
}
