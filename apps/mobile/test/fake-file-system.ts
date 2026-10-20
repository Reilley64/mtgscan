let files = new Map<string, string>();
let deleteListeners: ((uri: string) => void)[] = [];

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

  get name() {
    return this.uri.slice(this.uri.lastIndexOf('/') + 1);
  }

  async text() {
    const content = files.get(this.uri);
    if (content === undefined) {
      throw new Error(`No file at ${this.uri}`);
    }
    return content;
  }

  writeSync(content: string) {
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
    deleteListeners.forEach((listener) => listener(this.uri));
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

  get exists() {
    return [...files.keys()].some((uri) => uri.startsWith(this.uri));
  }

  create() {}

  list() {
    return [...files.keys()]
      .filter((uri) => uri.startsWith(this.uri) && !uri.slice(this.uri.length).includes('/'))
      .map((uri) => new FakeFile(uri));
  }
}

export const fakeFileSystem = {
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: { document: new FakeDirectory('file:///documents') },
};

export function filesIn(directoryUri: string) {
  return [...files.keys()].filter((uri) => uri.startsWith(directoryUri)).sort();
}

export function fileExists(uri: string) {
  return files.has(uri);
}

export function putFile(uri: string, content: string) {
  files.set(uri, content);
}

export function fileContent(uri: string) {
  return files.get(uri);
}

export function whenAFileIsDeleted(listener: (uri: string) => void) {
  deleteListeners = [...deleteListeners, listener];
}

export function resetFakeFileSystem() {
  files = new Map();
  deleteListeners = [];
}
