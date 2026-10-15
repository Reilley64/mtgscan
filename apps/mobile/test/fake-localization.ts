let regionCurrency: string | null = 'USD';

export const fakeLocalization = {
  ...jest.requireActual('expo-localization'),
  getLocales: () => [{ ...jest.requireActual('expo-localization').getLocales()[0], currencyCode: regionCurrency }],
};

export function phoneRegionCurrencyIs(currency: string | null) {
  regionCurrency = currency;
}

export function resetFakeLocalization() {
  regionCurrency = 'USD';
}
