import type { CollectionTotal, CopyDetails, CurrentPrice } from '@mtgscan/supabase/collection';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { copyOf, openCollection, openCopyPage } from './copies';
import { phoneRegionCurrencyIs } from './fake-localization';
import {
  answerCollectionSearches,
  failPriceCurrencyReads,
  offerPriceCurrencies,
  ownCollectionTotal,
  ownCopies,
  priceReadsSent,
  startSignedIn,
} from './fake-supabase';
import {
  drawerBackButton,
  headerButton,
  headerMenu,
  openSettings,
  pressTab,
  selectedTab,
  swipeDownDrawer,
  tabHeader,
  typeInSearchBar,
} from './native-ui';
import { renderApp, restartTheApp } from './render-app';

const rateDate = '2026-10-12';

function converted(amount: string, currency: string, exchangeRate: string) {
  return { amount, currency, approximate: true as const, exchange_rate: exchangeRate, rate_date: rateDate };
}

function audPrice(amount: string): CurrentPrice {
  return { ...converted(amount, 'AUD', '1.5234'), finish: 'nonfoil', stale: false };
}

const usdTotal: CollectionTotal = { total: '27.00', currency: 'USD', priced_copies: 2, copies: 2 };
const audTotal: CollectionTotal = { ...converted('41.13', 'AUD', '1.5234'), total: '41.13', priced_copies: 2, copies: 2 };

function audCopy(copyId: string, changes: Partial<CopyDetails> = {}) {
  return copyOf(copyId, {
    price: audPrice('12.30'),
    purchase_day_price: { ...converted('7.62', 'AUD', '1.5234'), finish: 'nonfoil' },
    ...changes,
  });
}

function priceCurrenciesSent() {
  return priceReadsSent().map(({ price_currency }) => price_currency);
}

async function openCurrencyList() {
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: /^Currency/ }));
  return screen.findByRole('header', { name: 'Currency' });
}

async function chooseCurrency(label: string) {
  await openCurrencyList();
  await fireEvent.press(screen.getByRole('checkbox', { name: label }));
  await swipeDownDrawer();
}

function collectionTotalButtons() {
  return tabHeader(selectedTab()).buttons.filter((button) => button?.startsWith('Collection total'));
}

beforeEach(() => {
  startSignedIn();
});

describe('the Currency row and list', () => {
  test('the settings drawer has a Currency row that shows the currency, and it pushes the currency list inside the drawer', async () => {
    await renderApp();
    await openSettings();

    const row = screen.getByRole('button', { name: 'Currency, USD' });
    expect(within(row).getByText('Currency')).toBeOnTheScreen();
    expect(within(row).getByText('USD')).toBeOnTheScreen();

    await fireEvent.press(row);

    expect(await screen.findByRole('header', { name: 'Currency' })).toBeOnTheScreen();
    expect(drawerBackButton()).toEqual({ label: 'Settings' });
  });

  test('the currency list shows each offered currency with its code and name, and the current currency has the check mark', async () => {
    offerPriceCurrencies(['AUD', 'EUR', 'JPY', 'USD']);
    await renderApp();

    await openCurrencyList();

    expect(screen.getAllByRole('checkbox').map((row) => row.props.accessibilityLabel)).toEqual([
      'AUD Australian dollar',
      'EUR Euro',
      'JPY Japanese yen',
      'USD US dollar',
    ]);
    expect(screen.getByRole('checkbox', { name: 'USD US dollar' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'AUD Australian dollar' })).not.toBeChecked();
  });

  test('the currency list comes from the server, so it offers a currency the app has no name for by its code', async () => {
    offerPriceCurrencies(['AUD', 'USD', 'XYZ']);
    await renderApp();

    await openCurrencyList();

    expect(screen.getAllByRole('checkbox').map((row) => row.props.accessibilityLabel)).toEqual(['AUD Australian dollar', 'USD US dollar', 'XYZ']);
  });

  test('choosing a currency checks it, goes back to settings, and the Currency row shows it', async () => {
    await renderApp();
    await openCurrencyList();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'AUD Australian dollar' }));

    expect(await screen.findByRole('button', { name: 'Currency, AUD' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Currency, AUD' }));
    expect(await screen.findByRole('checkbox', { name: 'AUD Australian dollar' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'USD US dollar' })).not.toBeChecked();
  });

  test('when the currency list cannot load, prices stay in USD and the list offers Try again', async () => {
    phoneRegionCurrencyIs('AUD');
    failPriceCurrencyReads(1);
    await openCollection();
    expect(priceCurrenciesSent()).toEqual(['USD', 'USD']);

    await openCurrencyList();
    expect(screen.getByText('Could not load the currencies')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('checkbox', { name: 'AUD Australian dollar' })).toBeChecked();
  });
});

describe('the currency setting', () => {
  test('on first launch, the currency is the phone region currency when it is offered', async () => {
    phoneRegionCurrencyIs('AUD');

    await openCollection();

    expect(priceCurrenciesSent()).toEqual(['AUD', 'AUD']);
  });

  test.each([
    ['is not offered', 'ARS'],
    ['is unknown', null],
  ])('on first launch, the currency is USD when the phone region currency %s', async (_, regionCurrency) => {
    phoneRegionCurrencyIs(regionCurrency);

    await openCollection();

    expect(priceCurrenciesSent()).toEqual(['USD', 'USD']);
  });

  test('the chosen currency survives a restart of the app', async () => {
    await renderApp();
    await chooseCurrency('JPY Japanese yen');

    await restartTheApp();
    await pressTab('Collection');

    expect(priceCurrenciesSent().at(-1)).toBe('JPY');
    await openSettings();
    expect(screen.getByRole('button', { name: 'Currency, JPY' })).toBeOnTheScreen();
  });

  test('the chosen currency stays on this phone after sign-out and sign-in', async () => {
    await renderApp();
    await chooseCurrency('EUR Euro');
    await openSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue with Google' }));
    await act(async () => {});
    await openSettings();

    expect(screen.getByRole('button', { name: 'Currency, EUR' })).toBeOnTheScreen();
  });

  test('a chosen currency that is no longer offered falls back to USD and says nothing', async () => {
    await renderApp();
    await chooseCurrency('HUF Hungarian forint');
    offerPriceCurrencies(['AUD', 'USD']);

    await restartTheApp();
    await pressTab('Collection');

    expect(priceCurrenciesSent().at(-1)).toBe('USD');
    await openSettings();
    expect(screen.getByRole('button', { name: 'Currency, USD' })).toBeOnTheScreen();
  });
});

describe('price reads in the chosen currency', () => {
  test('binder tiles, the collection total, and the copy page send the chosen currency', async () => {
    phoneRegionCurrencyIs('AUD');
    ownCopies([audCopy('copy-1')]);
    ownCollectionTotal(audTotal);

    await openCopyPage(/^Angelic Curator/);

    expect(priceReadsSent()).toHaveLength(3);
    expect(priceReadsSent()).toEqual(
      expect.arrayContaining([
        { read: 'search_collection', price_currency: 'AUD' },
        { read: 'get_collection_total', price_currency: 'AUD' },
        { read: 'get_copy', price_currency: 'AUD' },
      ]),
    );
  });

  test('a price filter sends its bound in the chosen currency, one minor unit below a "less than" bound', async () => {
    phoneRegionCurrencyIs('JPY');
    let lastQuery = {};
    answerCollectionSearches((query) => {
      lastQuery = query;
      return [];
    });
    await openCollection();

    await typeInSearchBar('price<500 ');

    expect(lastQuery).toEqual({ price_currency: 'JPY', price_max: '499' });
  });

  test('a price filter in a currency with cents keeps two decimals', async () => {
    phoneRegionCurrencyIs('AUD');
    let lastQuery = {};
    answerCollectionSearches((query) => {
      lastQuery = query;
      return [];
    });
    await openCollection();

    await typeInSearchBar('price>1500000 ');

    expect(lastQuery).toEqual({ price_currency: 'AUD', price_min: '1500000.01' });
  });

  test('changing the currency switches every price at once', async () => {
    ownCopies([copyOf('copy-1')]);
    answerCollectionSearches((query) => (query.price_currency === 'AUD' ? [audCopy('copy-1')] : [copyOf('copy-1')]));
    ownCollectionTotal(usdTotal, audTotal);
    const collection = await openCollection();
    expect(collection.getByRole('button', { name: /\$0\.35$/ })).toBeOnTheScreen();
    expect(collectionTotalButtons()).toEqual(['Collection total, $27.00']);

    await chooseCurrency('AUD Australian dollar');

    await waitFor(() => expect(collectionTotalButtons()).toEqual(['Collection total, ≈ A$41.13']));
    expect(collection.getByRole('button', { name: /≈ A\$12\.30$/ })).toBeOnTheScreen();
    expect(collection.queryByRole('button', { name: /\$0\.35$/ })).not.toBeOnTheScreen();
  });
});

describe('converted prices', () => {
  beforeEach(() => {
    phoneRegionCurrencyIs('AUD');
  });

  test('a converted tile price shows "≈" before it, and VoiceOver reads it', async () => {
    ownCopies([audCopy('copy-1')]);

    const collection = await openCollection();

    const tile = collection.getByRole('button', { name: 'Angelic Curator, MH2 262, ≈ A$12.30' });
    expect(within(tile).getByText('≈ A$12.30')).toBeOnTheScreen();
  });

  test.each([
    ['JPY', '1820', '≈ ¥1,820'],
    ['HUF', '4011.50', '≈ HUF\u00a04,011.50'],
    ['IDR', '220000.00', '≈ IDR\u00a0220,000.00'],
    ['EUR', '11.04', '≈ €11.04'],
  ])('a converted %s price of %s shows as %s, with the minor unit of the server', async (currency, amount, shown) => {
    ownCopies([copyOf('copy-1', { price: { ...converted(amount, currency, '1'), finish: 'nonfoil', stale: false } })]);

    const collection = await openCollection();

    expect(within(collection.getByRole('button', { name: /^Angelic Curator/ })).getByText(shown)).toBeOnTheScreen();
  });

  test('the converted collection total shows "≈", and its menu credits the converted price with the date of the exchange rate', async () => {
    ownCopies([audCopy('copy-1')]);
    ownCollectionTotal(audTotal);

    await openCollection();

    expect(headerButton(selectedTab(), 'Collection total, ≈ A$41.13')).toMatchObject({ label: '≈ A$41.13' });
    expect(headerMenu(selectedTab(), 'Collection total, ≈ A$41.13').title).toBe(
      'TCGplayer Market price via Scryfall, converted from USD at the ECB rate for 12 Oct',
    );
  });

  test('the copy page shows "≈" on the current price, the purchase-day price, and Since added, with the converted credit', async () => {
    ownCopies([audCopy('copy-1')]);

    await openCopyPage(/^Angelic Curator/);

    expect(screen.getByLabelText('Current price, ≈ A$12.30')).toBeOnTheScreen();
    expect(screen.getByLabelText('Purchase-day price, ≈ A$7.62')).toBeOnTheScreen();
    const sinceAdded = screen.getByLabelText('Since added, up ≈ A$4.68');
    expect(within(sinceAdded).getByText('≈ +A$4.68')).toBeOnTheScreen();
    expect(screen.getByText('TCGplayer Market price via Scryfall, converted from USD at the ECB rate for 12 Oct')).toBeOnTheScreen();
  });

  test('a converted copy with no price shows no credit', async () => {
    ownCopies([copyOf('copy-1', { price: null, purchase_day_price: null })]);

    await openCopyPage(/^Angelic Curator/);

    expect(screen.queryByText(/Scryfall/)).not.toBeOnTheScreen();
  });
});

describe('USD prices', () => {
  test('USD prices show with no "≈" and keep the USD credit', async () => {
    ownCopies([copyOf('copy-1')]);
    ownCollectionTotal(usdTotal);

    const collection = await openCollection();
    expect(collection.getByRole('button', { name: 'Angelic Curator, MH2 262, $0.35' })).toBeOnTheScreen();
    expect(headerMenu(selectedTab(), 'Collection total, $27.00').title).toBe('Current prices from Scryfall, in USD');

    await fireEvent.press(collection.getByRole('button', { name: /^Angelic Curator/ }));
    await screen.findByRole('header', { name: 'Price' });
    expect(screen.getByLabelText('Since added, up $0.14')).toBeOnTheScreen();
    expect(screen.getByText('Current prices from Scryfall, in USD')).toBeOnTheScreen();
  });
});
