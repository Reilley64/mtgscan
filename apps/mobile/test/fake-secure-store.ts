let storedItems = new Map<string, string>();

export const fakeSecureStore = {
  ...jest.requireActual('expo-secure-store'),
  getItem: (key: string) => storedItems.get(key) ?? null,
  getItemAsync: async (key: string) => storedItems.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    storedItems.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    storedItems.delete(key);
  },
};

export function resetFakeSecureStore() {
  storedItems = new Map();
}
