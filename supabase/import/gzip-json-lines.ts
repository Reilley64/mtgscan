export async function* readGzipJsonLines(body: ReadableStream<Uint8Array<ArrayBuffer>>): AsyncGenerator<unknown> {
  const text = body
    .pipeThrough(new DecompressionStream('gzip'))
    .pipeThrough(new TextDecoderStream());
  let partialLine = '';
  for await (const chunk of text) {
    const lines = (partialLine + chunk).split('\n');
    partialLine = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        yield JSON.parse(line);
      }
    }
  }
  if (partialLine.trim()) {
    yield JSON.parse(partialLine);
  }
}
