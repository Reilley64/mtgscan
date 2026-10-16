let copiedText: string | null = null;

export const fakeClipboard = {
  async setStringAsync(text: string) {
    copiedText = text;
    return true;
  },
};

export function textOnTheClipboard() {
  return copiedText;
}

export function resetFakeClipboard() {
  copiedText = null;
}
