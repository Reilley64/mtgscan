let files = new Map<string, string>();

type Location = string | { uri: string };

function joined(...locations: Location[]) {
  return locations
    .map((location) => (typeof location === 'string' ? location : location.uri))
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

class FakeFile {
  uri: string;

  constructor(...locations: Location[]) {
    this.uri = joined(...locations);
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

  moveSync(destination: FakeFile) {
    const content = files.get(this.uri);
    if (content === undefined) {
      throw new Error(`No file at ${this.uri}`);
    }
    files.delete(this.uri);
    files.set(destination.uri, content);
    this.uri = destination.uri;
  }

  delete() {
    if (!files.delete(this.uri)) {
      throw new Error(`No file at ${this.uri}`);
    }
  }
}

class FakeDirectory {
  readonly uri: string;

  constructor(...locations: Location[]) {
    this.uri = `${joined(...locations)}/`;
  }

  create() {}
}

export const fakeFileSystem = {
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: { document: new FakeDirectory('file:///documents') },
};

export function filesIn(directoryUri: string) {
  return [...files.keys()].filter((uri) => uri.startsWith(directoryUri)).sort();
}

export function putFile(uri: string, content: string) {
  files.set(uri, content);
}

export function resetFakeFileSystem() {
  files = new Map();
}
