import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import {
  cardImageUri as catalogImageUri,
  setIconUri,
  lightningBolt2xm,
  lightningBoltList,
  lightningBoltM10,
  lightningBoltSld,
  plains,
  shock,
  solRingCommander,
  solRingEtched,
  tamiyosJournal,
  tamiyosJournalPrerelease,
  tamiyosJournalPromo,
} from './card-printings';
import { resetSampleClock } from './detection-samples';
import { photosDeleted } from './fake-card-detector';
import { cardRecognition, holdNextRecognition, nextPhotosAre, notACard, photosRecognized } from './fake-card-recognizer';
import { liquidGlassIsAvailable } from './fake-glass-effect';
import { scanFeedback } from './fake-scan-feedback';
import { signInNextWithEmail, startSignedIn } from './fake-supabase';
import {
  appearsBefore,
  backdropOf,
  blocksColored,
  cardImageUri,
  glassEffect,
  glassGroupOf,
  isDrawerPresented,
  lineColoredBlocks,
  openSettings,
  presentedDrawer,
  pressTab,
  selectedTab,
  sideColumnWidths,
  swipeDownDrawer,
  symbolNames,
  symbolTintColor,
} from './native-ui';
import { renderApp } from './render-app';
import {
  expectDisabledQuickActions,
  latestScanChip,
  openLatestScan,
  openScan,
  quickActionsOfAnEmptyChip,
  scanACard,
  scanTab,
  selectedChoice,
} from './scanning';
import { tokenColors } from './token-colors';

const { surface, text: white, textMuted, textDim, glassTextMuted, glassTextDim, glassSkeleton } = tokenColors;

beforeEach(() => {
  resetSampleClock();
  startSignedIn();
});

test('a still card shows the skeleton chip until the recognizer answers', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm]));
  const recognition = holdNextRecognition();
  await openScan();

  await scanACard();
  expect(scanTab().getByRole('progressbar', { name: 'Recognizing card' })).toBeOnTheScreen();

  await recognition.finish();
  expect(scanTab().queryByRole('progressbar', { name: 'Recognizing card' })).not.toBeOnTheScreen();
  expect(latestScanChip('Lightning Bolt, M10 146')).toBeOnTheScreen();
});

test('the latest-scan chip shows the card image, name, set and collector number', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm]));
  await openScan();

  await scanACard();

  const chip = latestScanChip('Lightning Bolt, M10 146');
  expect(within(chip).getByText('Lightning Bolt')).toBeOnTheScreen();
  expect(within(chip).getByText('M10 146')).toBeOnTheScreen();
  expect(cardImageUri(chip)).toBe(catalogImageUri(lightningBoltM10.printingId));
  expect(within(chip).queryByText(/Nonfoil/)).not.toBeOnTheScreen();
});

test('without Liquid Glass, the latest-scan chip is a surface card with the name centered over the meta line', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();

  await scanACard();

  const chip = latestScanChip('Lightning Bolt, M10 146');
  expect(glassEffect(backdropOf(chip))).toBeNull();
  expect(backdropOf(chip)).toHaveStyle({ backgroundColor: surface, borderRadius: 12 });
  expect(chip).toHaveStyle({ padding: 8 });
  expect(within(chip).getByText('Lightning Bolt')).toHaveStyle({ color: white, fontWeight: '700', textAlign: 'center' });
  expect(within(chip).getByText('M10 146')).toHaveStyle({ color: textMuted, fontSize: 12, textAlign: 'center' });
  expect(symbolTintColor(chip)).toBe(textDim);
});

test('the latest-scan chip centers the name and meta line between a thumbnail column and a chevron column of the same width', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();

  await scanACard();

  const chip = latestScanChip('Lightning Bolt, M10 146');
  expect(symbolNames(chip)).toEqual(['chevron.right']);
  expect(sideColumnWidths(within(chip).getByText('Lightning Bolt'))).toEqual({ start: 40, end: 40 });
  expect(sideColumnWidths(within(chip).getByText('M10 146'))).toEqual({ start: 40, end: 40 });
});

test('on Liquid Glass, the latest-scan chip and the quick-action bar are regular glass with no tint in one glass group', async () => {
  liquidGlassIsAvailable();
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();

  await scanACard();

  const chip = latestScanChip('Lightning Bolt, M10 146');
  const bar = scanTab().getByRole('button', { name: '+1' });
  expect(glassEffect(backdropOf(chip))).toEqual({ style: 'regular', interactive: true, tintColor: undefined });
  expect(backdropOf(chip)).toHaveStyle({ borderRadius: 12 });
  expect(glassEffect(backdropOf(bar))).toEqual({ style: 'regular', interactive: true, tintColor: undefined });
  expect(glassGroupOf(chip)).not.toBeNull();
  expect(glassGroupOf(bar)).toBe(glassGroupOf(chip));
});

test('on Liquid Glass, the batch button over the camera is glass too', async () => {
  liquidGlassIsAvailable();
  await openScan();

  const batchButton = scanTab().getByRole('button', { name: 'Scan batch' });
  expect(glassEffect(backdropOf(batchButton))).toEqual({ style: 'regular', interactive: true, tintColor: undefined });
});

test('on Liquid Glass, the meta line and the chevron take the lighter glass text colors', async () => {
  liquidGlassIsAvailable();
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();

  await scanACard();

  const chip = latestScanChip('Lightning Bolt, M10 146');
  expect(within(chip).getByText('Lightning Bolt')).toHaveStyle({ color: white });
  expect(within(chip).getByText('M10 146')).toHaveStyle({ color: glassTextMuted });
  expect(symbolTintColor(chip)).toBe(glassTextDim);
});

test('on Liquid Glass, the disabled quick actions have glass text dim labels', async () => {
  liquidGlassIsAvailable();
  nextPhotosAre(cardRecognition([lightningBoltList]));
  await openScan();
  expect(within(scanTab().getByRole('button', { name: 'Nonfoil' })).getByText('Nonfoil')).toHaveStyle({ color: glassTextDim });
  expect(symbolTintColor(scanTab().getByRole('button', { name: 'Set' }))).toBe(glassTextDim);

  await scanACard();

  expect(within(scanTab().getByRole('button', { name: 'Nonfoil' })).getByText('Nonfoil')).toHaveStyle({ color: glassTextDim });
  expect(within(scanTab().getByRole('button', { name: '+1' })).getByText('+1')).toHaveStyle({ color: white });
});

test('without Liquid Glass, the skeleton chip shows line-colored blocks on a surface card', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  holdNextRecognition();
  await openScan();

  await scanACard();

  const skeleton = scanTab().getByRole('progressbar', { name: 'Recognizing card' });
  expect(backdropOf(skeleton)).toHaveStyle({ backgroundColor: surface, borderRadius: 12 });
  expect(lineColoredBlocks(skeleton)).toBe(3);
});

test('on Liquid Glass, the skeleton chip shows glass skeleton blocks on glass that does not react to touch', async () => {
  liquidGlassIsAvailable();
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  holdNextRecognition();
  await openScan();

  await scanACard();

  const skeleton = scanTab().getByRole('progressbar', { name: 'Recognizing card' });
  expect(glassEffect(backdropOf(skeleton))).toEqual({ style: 'regular', interactive: false, tintColor: undefined });
  expect(blocksColored(skeleton, glassSkeleton)).toBe(3);
  expect(lineColoredBlocks(skeleton)).toBe(0);
  expect(glassGroupOf(skeleton)).toBe(glassGroupOf(scanTab().getByRole('button', { name: '+1' })));
});

test('the chip shows the finish when it is not nonfoil', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10], { premiumMark: true }));
  await openScan();

  await scanACard();

  expect(latestScanChip('Lightning Bolt, M10 146, Foil')).toBeOnTheScreen();
  expect(scanTab().getByText('M10 146 · Foil')).toBeOnTheScreen();
});

test.each([
  ['foil when the collector line shows the star and the printing has foil', lightningBoltM10, true, 'Lightning Bolt, M10 146, Foil'],
  ['nonfoil when the collector line shows no star', lightningBoltM10, false, 'Lightning Bolt, M10 146'],
  ['nonfoil when the star shows but the printing has no foil', lightningBoltList, true, 'Lightning Bolt, PLST M10-146'],
  ['foil before etched when the printing has no nonfoil', lightningBoltSld, false, 'Lightning Bolt, SLD 1001, Foil'],
  ['etched when etched is the only finish', solRingEtched, false, 'Sol Ring, CMM 700, Etched'],
])('the default finish is %s', async (_rule, printing, premiumMark, chip) => {
  nextPhotosAre(cardRecognition([printing], { premiumMark }));
  await openScan();

  await scanACard();

  expect(latestScanChip(chip)).toBeOnTheScreen();
});

test('+1 adds another copy as its own scan and the chip edits the new copy', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: '+1' }));
  await fireEvent.press(scanTab().getByRole('button', { name: 'Nonfoil' }));

  expect(latestScanChip('Lightning Bolt, M10 146, Foil')).toBeOnTheScreen();
  expect(scanTab().queryByText(/copies/)).not.toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: 'Scan batch, 2' })).toBeOnTheScreen();
});

test('a new scan replaces the chip', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();

  await scanACard();
  await scanACard();

  expect(latestScanChip('Shock, M19 156')).toBeOnTheScreen();
  expect(scanTab().queryByText('Lightning Bolt')).not.toBeOnTheScreen();
});

test('a photo that is not a card makes no chip', async () => {
  nextPhotosAre(notACard());
  await openScan();

  await scanACard();

  expect(scanTab().queryByRole('button', { name: /, / })).not.toBeOnTheScreen();
  expect(scanTab().queryByRole('progressbar')).not.toBeOnTheScreen();
});

test('a photo that is not a card brings back the previous chip', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), notACard());
  await openScan();

  await scanACard();
  await scanACard();

  expect(latestScanChip('Lightning Bolt, M10 146')).toBeOnTheScreen();
});

test('a basic land shows that it is not tracked and has no +1', async () => {
  nextPhotosAre(cardRecognition([plains]));
  await openScan();

  await scanACard();

  expect(scanTab().getByText('Basic land, not tracked')).toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: '+1' })).toBeDisabled();
});

test('a scan that is not recognized shows a chip that opens name search', async () => {
  nextPhotosAre('unreadable_photo');
  await openScan();
  await scanACard();

  expect(scanTab().getByText('Not recognized')).toBeOnTheScreen();
  expect(scanTab().getByText('Tap to search')).toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: '+1' })).toBeDisabled();

  await openLatestScan('Not recognized, Tap to search');

  expect(await screen.findByLabelText('Card name')).toBeOnTheScreen();
});

test('the photo goes to the recognizer and is deleted when the recognizer answers', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  const recognition = holdNextRecognition();
  await openScan();

  await scanACard();
  expect(photosRecognized()).toEqual(['file:///tmp/scan-1.jpg']);
  expect(photosDeleted()).toEqual([]);

  await recognition.finish();
  expect(photosDeleted()).toEqual(['file:///tmp/scan-1.jpg']);
});

test('a recognized card plays a heavy impact haptic and the recognized sound', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();

  await scanACard();

  expect(scanFeedback()).toEqual(['heavy impact', 'recognized sound']);
});

test('a scan that is not recognized plays a warning haptic and the failed sound', async () => {
  nextPhotosAre('rectification_failed');
  await openScan();

  await scanACard();

  expect(scanFeedback()).toEqual(['warning haptic', 'failed sound']);
});

test('a photo that is not a card plays no haptic and no sound', async () => {
  nextPhotosAre(notACard());
  await openScan();

  await scanACard();

  expect(scanFeedback()).toEqual([]);
});

test('scan sounds are on by default and the Scan sounds switch turns them off but keeps the haptics', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), 'unreadable_photo');
  await renderApp();
  await openSettings();
  const scanSounds = screen.getByRole('switch', { name: 'Scan sounds' });
  expect(scanSounds).toBeChecked();

  await fireEvent.press(scanSounds);
  expect(screen.getByRole('switch', { name: 'Scan sounds' })).not.toBeChecked();
  await swipeDownDrawer();
  await pressTab('Scan');
  await scanACard();
  await scanACard();

  expect(scanFeedback()).toEqual(['heavy impact', 'warning haptic']);
});

test('tapping the chip opens the details sheet with the card image, name, set and collector number', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await openLatestScan('Lightning Bolt, M10 146');

  expect(await screen.findByRole('header', { name: 'Lightning Bolt' })).toBeOnTheScreen();
  expect(cardImageUri(screen.getByRole('image', { name: 'Lightning Bolt' }))).toBe(
    catalogImageUri(lightningBoltM10.printingId),
  );
  expect(screen.getByText('M10 146')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'None of these: search' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Remove scan' })).toBeOnTheScreen();
});

test('the details sheet opens as a bottom drawer with a grabber at full height only', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await openLatestScan('Lightning Bolt, M10 146');

  expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [1], openingHeight: 1 });
});

test('a downward swipe closes the details sheet', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openLatestScan('Lightning Bolt, M10 146');

  await swipeDownDrawer();

  expect(screen.queryByRole('button', { name: 'Remove scan' })).not.toBeOnTheScreen();
});

test('the details sheet offers only the finishes of the printing and changes the finish', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openLatestScan('Lightning Bolt, M10 146');

  expect(selectedChoice('Nonfoil')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Etched' })).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Foil' }));
  expect(selectedChoice('Foil')).toBeOnTheScreen();

  await swipeDownDrawer();
  expect(latestScanChip('Lightning Bolt, M10 146, Foil')).toBeOnTheScreen();
});

test('the details sheet changes the condition and the language, which start at near mint and English', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await openLatestScan('Lightning Bolt, M10 146');
  expect(selectedChoice('NM')).toBeOnTheScreen();
  expect(selectedChoice('English')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'LP' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Japanese' }));
  await swipeDownDrawer();
  await openLatestScan('Lightning Bolt, M10 146');

  expect(selectedChoice('LP')).toBeOnTheScreen();
  expect(selectedChoice('Japanese')).toBeOnTheScreen();
});

test('Other options lists every same-text twin first, then the other likely printings', async () => {
  nextPhotosAre(
    cardRecognition([tamiyosJournal, tamiyosJournalPrerelease, tamiyosJournalPromo, lightningBoltM10, shock]),
  );
  await openScan();
  await scanACard();
  await openLatestScan("Tamiyo's Journal, SOI 265");

  const options = screen
    .getAllByRole('button')
    .map((button) => button.props.accessibilityLabel)
    .filter((label) => label?.includes(', '));

  expect(options).toEqual([
    "Tamiyo's Journal, PSOI 265s",
    "Tamiyo's Journal, PSOI 265p",
    'Lightning Bolt, M10 146',
    'Shock, M19 156',
  ]);
});

test('choosing another option switches the printing and takes its default finish when the finish does not exist', async () => {
  nextPhotosAre(cardRecognition([tamiyosJournal, tamiyosJournalPrerelease]));
  await openScan();
  await scanACard();
  await openLatestScan("Tamiyo's Journal, SOI 265");
  await fireEvent.press(screen.getByRole('button', { name: 'LP' }));

  await fireEvent.press(screen.getByRole('button', { name: "Tamiyo's Journal, PSOI 265s" }));

  expect(screen.getByText('PSOI 265s')).toBeOnTheScreen();
  expect(selectedChoice('Foil')).toBeOnTheScreen();
  expect(selectedChoice('LP')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: "Tamiyo's Journal, SOI 265" })).toBeOnTheScreen();
});

test('choosing another option keeps the finish when the new printing has it', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBolt2xm], { premiumMark: true }));
  await openScan();
  await scanACard();
  await openLatestScan('Lightning Bolt, M10 146, Foil');

  await fireEvent.press(screen.getByRole('button', { name: 'Lightning Bolt, 2XM 117' }));
  await swipeDownDrawer();

  expect(latestScanChip('Lightning Bolt, 2XM 117, Foil')).toBeOnTheScreen();
});

test('name search suggests card names and lists every paper printing of the chosen card with images, newest first', async () => {
  nextPhotosAre(cardRecognition([shock]));
  await openScan();
  await scanACard();
  await openLatestScan('Shock, M19 156');
  await fireEvent.press(screen.getByRole('button', { name: 'None of these: search' }));

  await fireEvent.changeText(screen.getByLabelText('Card name'), 'light');
  await fireEvent.press(await screen.findByRole('button', { name: 'Lightning Bolt' }));

  const printings = [lightningBoltSld, lightningBolt2xm, lightningBoltList, lightningBoltM10];
  const tiles = await screen.findAllByRole('button', { name: /^Lightning Bolt, / });
  expect(tiles.map((tile) => tile.props.accessibilityLabel)).toEqual([
    'Lightning Bolt, SLD 1001',
    'Lightning Bolt, 2XM 117',
    'Lightning Bolt, PLST M10-146',
    'Lightning Bolt, M10 146',
  ]);
  expect(tiles.map(cardImageUri)).toEqual(printings.map((printing) => catalogImageUri(printing.printingId)));
});

test('choosing a printing from name search fixes the scan', async () => {
  nextPhotosAre('unreadable_photo');
  await openScan();
  await scanACard();
  await openLatestScan('Not recognized, Tap to search');

  await fireEvent.changeText(await screen.findByLabelText('Card name'), 'bolt');
  await fireEvent.press(await screen.findByRole('button', { name: 'Lightning Bolt' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Lightning Bolt, 2XM 117' }));

  expect(await screen.findByRole('header', { name: 'Lightning Bolt' })).toBeOnTheScreen();
  await swipeDownDrawer();
  expect(latestScanChip('Lightning Bolt, 2XM 117')).toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: '+1' })).toBeOnTheScreen();
});

test('name search says when no card name matches the text', async () => {
  nextPhotosAre(cardRecognition([shock]));
  await openScan();
  await scanACard();
  await openLatestScan('Shock, M19 156');
  await fireEvent.press(screen.getByRole('button', { name: 'None of these: search' }));

  await fireEvent.changeText(screen.getByLabelText('Card name'), 'zzzz ');

  expect(await screen.findByText('No card names match "zzzz".')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Card name'), 'light');
  expect(await screen.findByRole('button', { name: 'Lightning Bolt' })).toBeOnTheScreen();
  expect(screen.queryByText(/^No card names match/)).not.toBeOnTheScreen();
});

test('choosing a basic land in name search says it is not tracked and changes nothing', async () => {
  nextPhotosAre(cardRecognition([shock]));
  await openScan();
  await scanACard();
  await openLatestScan('Shock, M19 156');
  await fireEvent.press(screen.getByRole('button', { name: 'None of these: search' }));

  await fireEvent.changeText(screen.getByLabelText('Card name'), 'plains');
  await fireEvent.press(await screen.findByRole('button', { name: 'Plains' }));

  expect(await screen.findByText('Basic lands are not tracked.')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /^Plains, / })).not.toBeOnTheScreen();
  await swipeDownDrawer();
  expect(latestScanChip('Shock, M19 156')).toBeOnTheScreen();
});

test('Remove scan removes only the current copy and leaves the chip empty', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await fireEvent.press(scanTab().getByRole('button', { name: '+1' }));
  await openLatestScan('Lightning Bolt, M10 146');

  await fireEvent.press(screen.getByRole('button', { name: 'Remove scan' }));

  expect(screen.queryByRole('button', { name: 'Remove scan' })).not.toBeOnTheScreen();
  expect(scanTab().queryByText('Lightning Bolt')).not.toBeOnTheScreen();
  expectDisabledQuickActions();
  expect(scanTab().getByRole('button', { name: 'Scan batch, 1' })).toBeOnTheScreen();
});

test('the scan stays after the user leaves the Scan tab and comes back', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await pressTab('Collection');
  await pressTab('Scan');

  expect(latestScanChip('Lightning Bolt, M10 146')).toBeOnTheScreen();
});

test('another account that signs in on the phone does not see the latest scan', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await pressTab('Recent');
  await openSettings();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  signInNextWithEmail('friend@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
  await act(async () => {});
  await pressTab('Scan');

  expect(scanTab().queryByText('Lightning Bolt')).not.toBeOnTheScreen();
});

test('the finish quick action switches the latest scan between the finishes of its printing', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'Nonfoil' }));
  expect(latestScanChip('Lightning Bolt, M10 146, Foil')).toBeOnTheScreen();

  await fireEvent.press(scanTab().getByRole('button', { name: 'Foil' }));
  expect(latestScanChip('Lightning Bolt, M10 146')).toBeOnTheScreen();
  expect(scanTab().getByRole('button', { name: 'Nonfoil' })).toBeOnTheScreen();
});

test('the finish quick action cycles nonfoil, foil, and etched when the printing has all three', async () => {
  const boltWithEtched = { ...lightningBoltM10, finishes: ['nonfoil', 'foil', 'etched'] } as typeof lightningBoltM10;
  nextPhotosAre(cardRecognition([boltWithEtched]));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'Nonfoil' }));
  await fireEvent.press(scanTab().getByRole('button', { name: 'Foil' }));
  expect(latestScanChip('Lightning Bolt, M10 146, Etched')).toBeOnTheScreen();

  await fireEvent.press(scanTab().getByRole('button', { name: 'Etched' }));
  expect(latestScanChip('Lightning Bolt, M10 146')).toBeOnTheScreen();
});

test('the finish quick action is disabled when the printing has one finish', async () => {
  nextPhotosAre(cardRecognition([lightningBoltList]));
  await openScan();
  await scanACard();

  expect(scanTab().getByRole('button', { name: 'Nonfoil' })).toBeDisabled();
  expect(scanTab().getByRole('button', { name: 'PLST' })).toBeEnabled();
  expect(scanTab().getByRole('button', { name: '+1' })).toBeEnabled();
});

test('the quick actions show in the order finish, condition, set, language, +1 and are disabled before the first scan with the defaults', async () => {
  await openScan();

  const actions = quickActionsOfAnEmptyChip.map((name) => scanTab().getByRole('button', { name }));
  actions.forEach((action) => expect(action).toBeDisabled());
  actions.slice(1).forEach((action, index) => expect(appearsBefore(actions[index], action)).toBe(true));
  expect(selectedTab()).toHaveTextContent('NonfoilNMEN+1', { exact: true });
});

test('the condition quick action opens a short picker with the current condition marked, and a pick changes only the latest scan', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'NM' }));
  expect(await screen.findByRole('header', { name: 'Condition' })).toBeOnTheScreen();
  expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [0.5, 1], openingHeight: 0.5 });
  expect(selectedChoice('NM')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'LP' }));

  expect(isDrawerPresented()).toBe(false);
  expect(scanTab().getByRole('button', { name: 'LP' })).toBeEnabled();
  await scanACard();
  expect(scanTab().getByRole('button', { name: 'NM' })).toBeEnabled();
});

test('the language quick action opens a short picker with the current language marked, and a pick changes only the latest scan', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), cardRecognition([shock]));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'EN' }));
  expect(await screen.findByRole('header', { name: 'Language' })).toBeOnTheScreen();
  expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [0.5, 1], openingHeight: 0.5 });
  expect(selectedChoice('English')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Japanese' }));

  expect(isDrawerPresented()).toBe(false);
  expect(scanTab().getByRole('button', { name: 'JA' })).toBeEnabled();
  await scanACard();
  expect(scanTab().getByRole('button', { name: 'EN' })).toBeEnabled();
});

test('a scan that is not recognized and a basic land disable the quick actions', async () => {
  nextPhotosAre('unreadable_photo', cardRecognition([plains]));
  await openScan();

  await scanACard();
  expectDisabledQuickActions();

  await scanACard();
  expectDisabledQuickActions();
});

test('the quick actions keep the latest scan after a photo that is not a card', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]), notACard());
  await openScan();
  await scanACard();

  await scanACard();

  expect(scanTab().getByRole('button', { name: 'M10' })).toBeEnabled();
  await fireEvent.press(scanTab().getByRole('button', { name: '+1' }));
  expect(scanTab().getByRole('button', { name: 'Scan batch, 2' })).toBeOnTheScreen();
});

test('the set quick action lists every printing of the card with images, same-text twins first, then newest first', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10, lightningBoltList, shock], { sameTextTwinCount: 1 }));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'M10' }));

  const tiles = await screen.findAllByRole('button', { name: /^Lightning Bolt, / });
  expect(tiles.map((tile) => tile.props.accessibilityLabel)).toEqual([
    'Lightning Bolt, M10 146',
    'Lightning Bolt, PLST M10-146',
    'Lightning Bolt, SLD 1001',
    'Lightning Bolt, 2XM 117',
  ]);
  expect(tiles.map(cardImageUri)).toEqual(
    [lightningBoltM10, lightningBoltList, lightningBoltSld, lightningBolt2xm].map((printing) =>
      catalogImageUri(printing.printingId),
    ),
  );
  expect(screen.getByRole('button', { name: 'Lightning Bolt, M10 146', selected: true })).toBeOnTheScreen();
});

test('the printing picker opens as a bottom drawer with a grabber at full height only', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'M10' }));
  await screen.findByRole('button', { name: 'Lightning Bolt, 2XM 117' });

  expect(presentedDrawer()).toEqual({ showsGrabber: true, heights: [1], openingHeight: 1 });
});

test('a downward swipe closes the printing picker', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();
  await fireEvent.press(scanTab().getByRole('button', { name: 'M10' }));
  await screen.findByRole('button', { name: 'Lightning Bolt, 2XM 117' });

  await swipeDownDrawer();

  expect(isDrawerPresented()).toBe(false);
});

test('picking a printing from the set quick action switches the latest scan and keeps its finish when the printing has it', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10], { premiumMark: true }));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'M10' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Lightning Bolt, 2XM 117' }));

  expect(latestScanChip('Lightning Bolt, 2XM 117, Foil')).toBeOnTheScreen();
});

test('picking a printing from the set quick action takes its default finish when the finish does not exist', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10], { premiumMark: true }));
  await openScan();
  await scanACard();

  await fireEvent.press(scanTab().getByRole('button', { name: 'M10' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Lightning Bolt, PLST M10-146' }));

  expect(latestScanChip('Lightning Bolt, PLST M10-146')).toBeOnTheScreen();
});

test('a switch to a printing without the finish takes its default finish from the star on the collector line', async () => {
  nextPhotosAre(cardRecognition([solRingEtched, solRingCommander], { premiumMark: true }));
  await openScan();
  await scanACard();
  expect(latestScanChip('Sol Ring, CMM 700, Etched')).toBeOnTheScreen();

  await fireEvent.press(scanTab().getByRole('button', { name: 'CMM' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Sol Ring, C21 263' }));

  expect(latestScanChip('Sol Ring, C21 263, Foil')).toBeOnTheScreen();
});

test('a scan that is not recognized can be removed from name search', async () => {
  nextPhotosAre('unreadable_photo');
  await openScan();
  await scanACard();
  await openLatestScan('Not recognized, Tap to search');

  await fireEvent.press(await screen.findByRole('button', { name: 'Remove scan' }));

  expect(screen.queryByLabelText('Card name')).not.toBeOnTheScreen();
  expect(scanTab().queryByText('Not recognized')).not.toBeOnTheScreen();
});

test('the set quick action shows the set icon from the card catalog, tinted for the dark bar', async () => {
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();
  await scanACard();

  const setAction = scanTab().getByRole('button', { name: 'M10' });

  expect(cardImageUri(setAction)).toBe(setIconUri('m10'));
  expect(within(setAction).queryByText('M10')).not.toBeOnTheScreen();
});

test('the set quick action shows the set code when the card catalog has no icon for the set', async () => {
  nextPhotosAre(cardRecognition([solRingCommander]));
  await openScan();
  await scanACard();

  expect(within(scanTab().getByRole('button', { name: 'C21' })).getByText('C21')).toBeOnTheScreen();
});
