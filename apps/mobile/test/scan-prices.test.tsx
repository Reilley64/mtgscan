import type { CurrentPrice } from '@mtgscan/supabase/collection';
import { File, Paths } from 'expo-file-system';
import { fireEvent, screen, within } from 'expo-router/testing-library';

import { lightningBoltM10, shock } from './card-printings';
import { resetSampleClock } from './detection-samples';
import { cardRecognition, nextPhotosAre } from './fake-card-recognizer';
import { liquidGlassIsAvailable } from './fake-glass-effect';
import { offerCurrentPrices, startSignedIn } from './fake-supabase';
import { fail, hold, requestsSent } from './fake-supabase-controls';
import { appearsBefore, drawerTitle, openSettings, pressTab, swipeDownDrawer, swipeRight, symbolNames } from './native-ui';
import { restartTheApp } from './render-app';
import { latestScanChip, openScan, scanACard, scanTab } from './scanning';
import { tokenColors } from './token-colors';

const { textPrice, textMuted, textDim, glassTextMuted, glassTextDim } = tokenColors;

function usdPrice(amount: string, changes: Partial<CurrentPrice> = {}): CurrentPrice {
  return { amount, currency: 'USD', finish: 'nonfoil', stale: false, ...changes };
}

const boltM10 = { printing_id: lightningBoltM10.printingId, finish: 'nonfoil' } as const;
const boltM10Foil = { printing_id: lightningBoltM10.printingId, finish: 'foil' } as const;
const shockM19 = { printing_id: shock.printingId, finish: 'nonfoil' } as const;

async function openBatchReview(count: number) {
  await fireEvent.press(scanTab().getByRole('button', { name: `Scan batch, ${count}` }));
  await screen.findByText(/^(Add to collection|Try again)$/);
}

function reviewRows() {
  return screen
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel as string | undefined)
    .filter((label) => label?.includes(' · '));
}

beforeEach(() => {
  resetSampleClock();
  startSignedIn();
});

describe('prices in batch review', () => {
  test('each batch review row shows the current price of its card printing and finish at its right end, and VoiceOver hears it', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87') }]);
    nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
    await openScan();
    await scanACard();
    await scanACard();

    await openBatchReview(2);

    expect(reviewRows()).toEqual(['Shock, M19 156 · NM · English, no price', 'Lightning Bolt, M10 146 · NM · English, $1.87']);
    const boltRow = screen.getByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English, $1.87' });
    expect(within(boltRow).getByText('$1.87')).toHaveStyle({ color: textPrice, fontSize: 12, fontWeight: '600' });
    expect(appearsBefore(within(boltRow).getByText('English', { exact: false }), within(boltRow).getByText('$1.87'))).toBe(true);
    const shockRow = screen.getByRole('button', { name: 'Shock, M19 156 · NM · English, no price' });
    expect(within(shockRow).getByText('–')).toHaveStyle({ color: textDim });
    expect(drawerTitle()).toBe('2 cards scanned');
  });

  test('a stale price on a batch review row has the clock symbol before it', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87', { stale: true }) }]);
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();

    await openBatchReview(1);

    expect(symbolNames(screen.getByRole('button', { name: 'Lightning Bolt, M10 146 · NM · English, $1.87' }))).toEqual(['clock']);
  });

  test('a converted price on a batch review row shows with no "≈" and no currency letters, and VoiceOver hears "about"', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87') }]);
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await chooseCurrency('AUD Australian dollar');
    await scanACard();

    await openBatchReview(1);

    expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English, about $2.85']);
    expect(within(screen.getByRole('button', { name: /^Lightning Bolt/ })).getByText('$2.85')).toBeOnTheScreen();
  });

  test('opening batch review reads every card printing and finish it has no price for yet, in calls of at most 100 items', async () => {
    const printings = Array.from({ length: 101 }, (_, index) => ({ ...lightningBoltM10, printingId: `bolt-${index}` }));
    new File(Paths.document, 'scan-batch-user-player@example.com.json').writeSync(
      JSON.stringify({
        formatVersion: 1,
        commitPending: false,
        scans: printings.map((printing, index) => ({
          scanId: `scan-${index}`,
          options: [],
          sameTextTwinCount: 0,
          premiumMark: false,
          printing,
          finish: 'nonfoil',
          condition: 'near_mint',
          language: 'en',
        })),
      }),
    );
    offerCurrentPrices([]);
    await openScan();

    await openBatchReview(101);

    expect(requestsSent('get_current_prices').map(({ items }) => items.length)).toEqual([100, 1]);
    expect(new Set(requestsSent('get_current_prices').flatMap(({ items }) => items.map((item) => item.printing_id))).size).toBe(101);
  });
});

describe('prices on the latest-scan chip', () => {
  test('the chip shows the current price at the end of the meta line in the meta line color, and VoiceOver hears it', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87') }]);
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();

    await scanACard();

    const chip = latestScanChip('Lightning Bolt, M10 146, $1.87');
    expect(within(chip).getByText('M10 146 ·')).toHaveStyle({ color: textMuted, fontSize: 12 });
    expect(within(chip).getByText('$1.87')).toHaveStyle({ color: textMuted, fontSize: 12, fontWeight: '600' });
  });

  test('on Liquid Glass, the price on the chip takes the glass meta line color, and a missing price the glass dim color', async () => {
    liquidGlassIsAvailable();
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87', { stale: true }) }]);
    nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
    await openScan();

    await scanACard();
    const chip = latestScanChip('Lightning Bolt, M10 146, $1.87');
    expect(within(chip).getByText('$1.87')).toHaveStyle({ color: glassTextMuted });
    expect(symbolNames(chip)).toEqual(['clock', 'chevron.right']);

    await scanACard();
    expect(within(latestScanChip('Shock, M19 156, no price')).getByText('–')).toHaveStyle({ color: glassTextDim });
  });

  test('a foil scan shows the price after the finish on the meta line', async () => {
    offerCurrentPrices([{ ...boltM10Foil, price: usdPrice('4.10', { finish: 'foil' }) }]);
    nextPhotosAre(cardRecognition([lightningBoltM10], { premiumMark: true }));
    await openScan();

    await scanACard();

    expect(within(latestScanChip('Lightning Bolt, M10 146, Foil, $4.10')).getByText('M10 146 · Foil ·')).toBeOnTheScreen();
  });

  test('a finish change on the chip reads the price of the new finish once, and the price follows the finish', async () => {
    offerCurrentPrices([
      { ...boltM10, price: usdPrice('1.87') },
      { ...boltM10Foil, price: usdPrice('4.10', { finish: 'foil' }) },
    ]);
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();

    await fireEvent.press(scanTab().getByRole('button', { name: 'Nonfoil' }));
    expect(latestScanChip('Lightning Bolt, M10 146, Foil, $4.10')).toBeOnTheScreen();
    await fireEvent.press(scanTab().getByRole('button', { name: 'Foil' }));

    expect(latestScanChip('Lightning Bolt, M10 146, $1.87')).toBeOnTheScreen();
    expect(requestsSent('get_current_prices')).toEqual([{ items: [boltM10] }, { items: [boltM10Foil] }]);
  });
});

describe('reading prices', () => {
  test('nothing shows while a price read runs', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87') }]);
    const read = hold('get_current_prices');
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();

    await scanACard();
    const chip = latestScanChip('Lightning Bolt, M10 146');
    expect(within(chip).queryByText('–')).not.toBeOnTheScreen();
    expect(symbolNames(chip)).toEqual(['chevron.right']);

    await read.finish();
    expect(latestScanChip('Lightning Bolt, M10 146, $1.87')).toBeOnTheScreen();
  });

  test('offline, nothing shows on the chip or in batch review, and the commit still works', async () => {
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();
    expect(latestScanChip('Lightning Bolt, M10 146')).toBeOnTheScreen();

    await openBatchReview(1);

    expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English']);
    expect(screen.queryByText('–')).not.toBeOnTheScreen();
    await swipeRight(screen.getByRole('button', { name: 'Add to collection' }), 1);
    expect(requestsSent('add_scan_batch')).toHaveLength(1);
  });

  test('a failed read shows nothing and is tried again only when batch review opens', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87') }]);
    fail('get_current_prices', 1);
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();
    expect(latestScanChip('Lightning Bolt, M10 146')).toBeOnTheScreen();
    await fireEvent.press(scanTab().getByRole('button', { name: 'NM' }));
    await swipeDownDrawer();
    expect(requestsSent('get_current_prices')).toHaveLength(1);

    await openBatchReview(1);

    expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English, $1.87']);
    expect(requestsSent('get_current_prices')).toHaveLength(2);
  });

  test('a failed read is tried again when the chip shows a new scan of the same card printing and finish', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87') }]);
    fail('get_current_prices', 1);
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();
    expect(latestScanChip('Lightning Bolt, M10 146')).toBeOnTheScreen();

    await fireEvent.press(scanTab().getByRole('button', { name: '+1' }));

    expect(latestScanChip('Lightning Bolt, M10 146, $1.87')).toBeOnTheScreen();
    expect(requestsSent('get_current_prices')).toHaveLength(2);
  });

  test('a failed read is not tried again while batch review stays open', async () => {
    offerCurrentPrices([{ ...shockM19, price: usdPrice('0.25') }]);
    fail('get_current_prices', 3);
    nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
    await openScan();
    await scanACard();
    await scanACard();
    await openBatchReview(2);
    expect(reviewRows()).toEqual(['Shock, M19 156 · NM · English', 'Lightning Bolt, M10 146 · NM · English']);
    expect(requestsSent('get_current_prices')).toHaveLength(3);

    await fireEvent.press(screen.getByRole('button', { name: 'Shock, M19 156 · NM · English' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove scan' }));

    expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English']);
    expect(requestsSent('get_current_prices')).toHaveLength(3);
  });

  test('each card printing and finish is read once per app session, however many scans and batch reviews show it', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87') }]);
    nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();
    await fireEvent.press(scanTab().getByRole('button', { name: '+1' }));
    await scanACard();

    await openBatchReview(3);
    await swipeDownDrawer();
    await openBatchReview(3);

    expect(reviewRows()).toEqual(Array(3).fill('Lightning Bolt, M10 146 · NM · English, $1.87'));
    expect(requestsSent('get_current_prices')).toEqual([{ items: [boltM10] }]);
  });

  test('a restart clears the prices, and they stay out of the scan batch file', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87') }]);
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();
    expect(latestScanChip('Lightning Bolt, M10 146, $1.87')).toBeOnTheScreen();
    expect(await new File(Paths.document, 'scan-batch-user-player@example.com.json').text()).not.toContain('1.87');

    await restartTheApp();
    await pressTab('Scan');
    await openBatchReview(1);

    expect(reviewRows()).toEqual(['Lightning Bolt, M10 146 · NM · English, $1.87']);
    expect(requestsSent('get_current_prices')).toHaveLength(2);
  });

  test('a currency change converts the known prices again without reading them again', async () => {
    offerCurrentPrices([{ ...boltM10, price: usdPrice('1.87') }]);
    nextPhotosAre(cardRecognition([lightningBoltM10]));
    await openScan();
    await scanACard();
    expect(latestScanChip('Lightning Bolt, M10 146, $1.87')).toBeOnTheScreen();

    await chooseCurrency('AUD Australian dollar');
    expect(latestScanChip('Lightning Bolt, M10 146, about $2.85')).toBeOnTheScreen();
    await chooseCurrency('USD US dollar');

    expect(latestScanChip('Lightning Bolt, M10 146, $1.87')).toBeOnTheScreen();
    expect(requestsSent('get_current_prices')).toEqual([{ items: [boltM10] }]);
  });
});

async function chooseCurrency(label: string) {
  await pressTab('Recent');
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: /^Currency/ }));
  await fireEvent.press(await screen.findByRole('checkbox', { name: label }));
  await swipeDownDrawer();
  await pressTab('Scan');
}
