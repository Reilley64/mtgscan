export async function inPool<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next]!;
      next += 1;
      try {
        await task(item);
      } catch (error) {
        next = items.length;
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: size }, worker));
}
