import type { CollectionTotal } from '@mtgscan/supabase/collection';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { returnToTheApp } from './app-state';
import { timePasses, todayIs } from './clock';
import { copyOf, openCollection, openCopyPage } from './copies';
import { phoneRegionCurrencyIs } from './fake-localization';
import { answerCollectionSearches, offerExchangeRates, ownCollectionTotal, ownCopies, startSignedIn } from './fake-supabase';
import { callsSent, fail, hold, requestsSent } from './fake-supabase-controls';
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

const audCredit = 'TCGplayer Market price via Scryfall, converted from USD at the ECB rate for 12 Oct';

const usdTotal: CollectionTotal = {
  total: '27.00',
  currency: 'USD',
  priced_copies: 2,
  copies: 2,
  stale: false,
  prices_observed_at: '2026-10-14T06:00:00.000Z',
};

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

function priceReadsSent() {
  return callsSent(['search_collection', 'get_collection_total', 'get_copy', 'get_current_prices']);
}

function curatorTile() {
  return within(selectedTab()).getByRole('button', { name: /^Angelic Curator/ });
}

beforeEach(() => {
  todayIs('2026-10-14T06:00:00Z');
  startSignedIn();
  ownCopies([copyOf('copy-1')]);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
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

  test('the currency list shows each currency with an exchange rate with its code and name, and the current currency has the check mark', async () => {
    offerExchangeRates(['AUD', 'EUR', 'JPY', 'USD']);
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

  test('the currency list comes from the exchange rates, so it offers a currency the app has no name for by its code', async () => {
    offerExchangeRates(['AUD', 'USD', 'XYZ']);
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

  test('when the exchange rates cannot load, prices stay in USD and the list offers Try again', async () => {
    phoneRegionCurrencyIs('AUD');
    fail('list_exchange_rates', 1);
    await openCollection();
    expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, $0.35');

    await openCurrencyList();
    expect(screen.getByText('Could not load the currencies')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('checkbox', { name: 'AUD Australian dollar' })).toBeChecked();
  });

  test('when the exchange rates cannot load, the app reads them again when the user returns to the app', async () => {
    phoneRegionCurrencyIs('AUD');
    fail('list_exchange_rates', 1);
    await openCollection();

    await returnToTheApp();

    await waitFor(() => expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, about $0.53'));
  });
});

describe('the exchange rate read', () => {
  test('the app reads the exchange rates once for the app session', async () => {
    await openCopyPage(/^Angelic Curator/);
    await returnToTheApp();
    await pressTab('Recent');
    await pressTab('Collection');

    expect(requestsSent('list_exchange_rates').length).toBe(1);
  });

  test('the app reads the exchange rates again when the user returns to the app more than a day later', async () => {
    phoneRegionCurrencyIs('AUD');
    ownCollectionTotal(usdTotal);
    await openCollection();

    await timePasses(23 * 60 * 60 * 1000);
    await returnToTheApp();
    expect(requestsSent('list_exchange_rates').length).toBe(1);

    offerExchangeRates(['AUD', 'USD'], '2026-10-15');
    await timePasses(2 * 60 * 60 * 1000);
    await returnToTheApp();

    expect(requestsSent('list_exchange_rates').length).toBe(2);
    await waitFor(() =>
      expect(headerMenu(selectedTab(), 'Collection total, about $41.13').title).toBe(
        'TCGplayer Market price via Scryfall, converted from USD at the ECB rate for 15 Oct',
      ),
    );
  });
});

describe('the currency setting', () => {
  test('on first launch, the currency is the phone region currency when it has an exchange rate', async () => {
    phoneRegionCurrencyIs('AUD');

    await openCollection();

    expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, about $0.53');
  });

  test.each([
    ['has no exchange rate', 'ARS'],
    ['is unknown', null],
  ])('on first launch, the currency is USD when the phone region currency %s', async (_, regionCurrency) => {
    phoneRegionCurrencyIs(regionCurrency);

    await openCollection();

    expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, $0.35');
  });

  test('the chosen currency survives a restart of the app', async () => {
    await renderApp();
    await chooseCurrency('JPY Japanese yen');

    await restartTheApp();
    await pressTab('Collection');

    expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, about ¥53');
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

  test('a chosen currency that no longer has an exchange rate falls back to USD and says nothing', async () => {
    await renderApp();
    await chooseCurrency('HUF Hungarian forint');
    offerExchangeRates(['AUD', 'USD']);

    await restartTheApp();
    await pressTab('Collection');

    expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, $0.35');
    await openSettings();
    expect(screen.getByRole('button', { name: 'Currency, USD' })).toBeOnTheScreen();
  });
});

describe('price reads', () => {
  test('binder tiles, the collection total, and the copy page read USD prices and send no currency', async () => {
    phoneRegionCurrencyIs('AUD');

    await openCopyPage(/^Angelic Curator/);

    expect(priceReadsSent().map(({ name }) => name).sort()).toEqual(['get_collection_total', 'get_copy', 'search_collection']);
    expect(priceReadsSent().filter(({ request }) => 'price_currency' in Object(request))).toEqual([]);
  });

  test('changing the currency switches every price at once without reading prices again', async () => {
    ownCollectionTotal(usdTotal);
    await openCollection();
    expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, $0.35');
    expect(collectionTotalButtons()).toEqual(['Collection total, $27.00']);
    const reads = hold('search_collection');

    await chooseCurrency('AUD Australian dollar');

    expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, about $0.53');
    await waitFor(() => expect(collectionTotalButtons()).toEqual(['Collection total, about $41.13']));
    await reads.finish();
    expect(priceReadsSent().filter(({ request }) => 'price_currency' in Object(request))).toEqual([]);
  });

  test('a price filter converts its bound to USD, one minor unit below a "less than" bound', async () => {
    phoneRegionCurrencyIs('JPY');
    let lastQuery = {};
    answerCollectionSearches((query) => {
      lastQuery = query;
      return [];
    });
    await openCollection();

    await typeInSearchBar('price<500 ');

    expect(lastQuery).toEqual({ price_max: '3.29' });
  });

  test('a large price filter in a currency with cents converts to USD cents', async () => {
    phoneRegionCurrencyIs('AUD');
    let lastQuery = {};
    answerCollectionSearches((query) => {
      lastQuery = query;
      return [];
    });
    await openCollection();

    await typeInSearchBar('price>1500000 ');

    expect(lastQuery).toEqual({ price_min: '984639.63' });
  });

  test('a price filter in USD sends its bound as it is', async () => {
    let lastQuery = {};
    answerCollectionSearches((query) => {
      lastQuery = query;
      return [];
    });
    await openCollection();

    await typeInSearchBar('price<=5 ');

    expect(lastQuery).toEqual({ price_max: '5.00' });
  });
});

describe('converted prices', () => {
  beforeEach(() => {
    phoneRegionCurrencyIs('AUD');
  });

  test('a converted tile price shows with no "≈" and no currency letters, and VoiceOver hears "about"', async () => {
    await openCollection();

    expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, about $0.53');
    expect(within(curatorTile()).getByText('$0.53')).toBeOnTheScreen();
  });

  test('an AUD price shows "$" even where Intl treats narrowSymbol as symbol, as Hermes does on iOS', async () => {
    const NodeNumberFormat = Intl.NumberFormat;
    jest
      .spyOn(Intl, 'NumberFormat')
      .mockImplementation((locales, options) =>
        NodeNumberFormat(locales, options?.currencyDisplay === 'narrowSymbol' ? { ...options, currencyDisplay: 'symbol' } : options),
      );

    await openCollection();

    expect(within(curatorTile()).getByText('$0.53')).toBeOnTheScreen();
  });

  test.each([
    ['JPY', '¥53'],
    ['HUF', 'Ft\u00a0113.58'],
    ['IDR', 'Rp\u00a06,272.35'],
    ['EUR', '€0.33'],
    ['CHF', 'CHF\u00a00.44'],
  ])('a price converted to %s shows as %s, with the narrow symbol and the minor unit of the currency', async (currency, shown) => {
    phoneRegionCurrencyIs(currency);

    await openCollection();

    expect(within(curatorTile()).getByText(shown)).toBeOnTheScreen();
  });

  test('the converted collection total converts the USD total once, and its menu credits the converted price with the date of the exchange rate', async () => {
    ownCollectionTotal(usdTotal);

    await openCollection();

    expect(headerButton(selectedTab(), 'Collection total, about $41.13')).toMatchObject({ label: '$41.13' });
    expect(headerMenu(selectedTab(), 'Collection total, about $41.13').title).toBe(audCredit);
  });

  test('the copy page converts the current price, the purchase-day price, and Since added, with the converted credit once', async () => {
    await openCopyPage(/^Angelic Curator/);

    expect(within(screen.getByLabelText('Current price, about $0.53')).getByText('$0.53')).toBeOnTheScreen();
    expect(within(screen.getByLabelText('Purchase-day price, about $0.32')).getByText('$0.32')).toBeOnTheScreen();
    expect(within(screen.getByLabelText('Since added, up about $0.21')).getByText('+$0.21')).toBeOnTheScreen();
    expect(screen.getAllByText(audCredit)).toHaveLength(1);
  });

  test('a converted copy with no price shows no credit', async () => {
    ownCopies([copyOf('copy-1', { price: null, purchase_day_price: null })]);

    await openCopyPage(/^Angelic Curator/);

    expect(screen.queryByText(/Scryfall/)).not.toBeOnTheScreen();
  });

  test.each<[string, string, string | undefined]>([
    ["Friday's rate on a Monday", '2026-10-12', undefined],
    ['a rate 4 days old', '2026-10-10', undefined],
    ['a rate 5 days old', '2026-10-09', 'The price may be out of date.'],
  ])('with %s, a converted tile price has the stale clock: %p', async (_, rateDate, hint) => {
    offerExchangeRates(['AUD', 'USD'], rateDate);

    await openCollection();

    expect(curatorTile().props.accessibilityHint).toBe(hint);
  });

  test('a converted collection total is stale when its exchange rate is more than 4 days old', async () => {
    offerExchangeRates(['AUD', 'USD'], '2026-10-09');
    ownCollectionTotal(usdTotal);

    await openCollection();

    expect(headerButton(selectedTab(), 'Collection total, about $41.13')).toMatchObject({
      hint: '2 of 2 cards priced. The prices may be out of date.',
    });
  });
});

describe('USD prices', () => {
  test('USD prices show with no "about" and keep the USD credit', async () => {
    offerExchangeRates(['AUD', 'USD'], '2026-10-01');
    ownCollectionTotal(usdTotal);

    await openCollection();
    expect(curatorTile()).toHaveProp('accessibilityLabel', 'Angelic Curator, MH2 262, $0.35');
    expect(curatorTile().props.accessibilityHint).toBeUndefined();
    expect(headerMenu(selectedTab(), 'Collection total, $27.00').title).toBe('Current prices from Scryfall, in USD');

    await fireEvent.press(curatorTile());
    await screen.findByRole('header', { name: 'Price' });
    expect(within(screen.getByLabelText('Since added, up $0.14')).getByText('+$0.14')).toBeOnTheScreen();
    expect(screen.getByText('Current prices from Scryfall, in USD')).toBeOnTheScreen();
  });
});
