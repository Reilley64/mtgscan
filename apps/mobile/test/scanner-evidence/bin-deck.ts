import { scanLogPrefix, type ScanLogLine } from '../../src/scan/scan-log';

export type DeckCard = { printingId: string; name: string; setCode: string; collectorNumber: string };

type ScanStatus = 'correct-accept' | 'false-accept' | 'abstained';

type Top = DeckCard;

export type CardDetail =
  | { card: string; status: ScanStatus; identity: boolean; printing: boolean; top: string; endToEndMs: number }
  | { card: string; status: 'no-result' };

export type ExtraDetail = { card: 'duplicate photo' | 'not a card' | 'failed' | 'not in deck'; status: string; top: string };

export type Gate = { name: string; passed: boolean; value: string };

const ansiCodes = /\u001b\[[0-9;]*m/g;

export function testDeckCards(tsv: string): DeckCard[] {
  return tsv
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [printingId, name, setCode, collectorNumber] = line.split('\t');
      return { printingId, name, setCode: setCode.toLowerCase(), collectorNumber };
    });
}

export function scanLogLines(metroLog: string): ScanLogLine[] {
  return metroLog.split('\n').flatMap((raw) => {
    const line = raw.replace(ansiCodes, '');
    const start = line.indexOf(`${scanLogPrefix}{`);
    return start < 0 ? [] : [JSON.parse(line.slice(start + scanLogPrefix.length)) as ScanLogLine];
  });
}

function label(card: DeckCard) {
  return `${card.name} ${card.setCode.toUpperCase()} #${card.collectorNumber}`;
}

function topOf(scan: ScanLogLine): Top | null {
  if (scan.kind !== 'card' || scan.candidates.length === 0) {
    return null;
  }
  const [{ printingId, name, setCode, collectorNumber }] = scan.candidates;
  return { printingId, name, setCode, collectorNumber };
}

function accepted(scan: ScanLogLine) {
  return scan.kind === 'card' && scan.decision.accepted;
}

function sameCard(a: DeckCard, b: DeckCard) {
  return a.name.toLowerCase() === b.name.toLowerCase();
}

function nearestRank(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? null : sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

function judged(card: DeckCard, scan: ScanLogLine, top: Top): CardDetail {
  const printing = top.printingId === card.printingId;
  return {
    card: label(card),
    status: !accepted(scan) ? 'abstained' : printing ? 'correct-accept' : 'false-accept',
    identity: sameCard(top, card),
    printing,
    top: label(top),
    endToEndMs: scan.endToEndMs,
  };
}

export function scoreBinDeck(deck: DeckCard[], metroLog: string) {
  const scans = scanLogLines(metroLog);
  const matched = new Map<DeckCard, ScanLogLine>();
  const leftover: ScanLogLine[] = [];
  for (const scan of scans) {
    const top = topOf(scan);
    const card = top && deck.find((candidate) => !matched.has(candidate) && candidate.printingId === top.printingId);
    if (card) {
      matched.set(card, scan);
    } else {
      leftover.push(scan);
    }
  }
  const extras: ExtraDetail[] = [];
  for (const scan of leftover) {
    const top = topOf(scan);
    const card =
      top &&
      !deck.some((candidate) => candidate.printingId === top.printingId) &&
      deck.find((candidate) => !matched.has(candidate) && sameCard(candidate, top));
    if (card) {
      matched.set(card, scan);
    } else if (scan.kind === 'failed') {
      extras.push({ card: 'failed', status: scan.error, top: 'none' });
    } else if (!top) {
      extras.push({ card: 'not a card', status: 'not-a-card', top: 'none' });
    } else if (deck.some((candidate) => sameCard(candidate, top))) {
      extras.push({ card: 'duplicate photo', status: 'duplicate', top: label(top) });
    } else {
      extras.push({ card: 'not in deck', status: accepted(scan) ? 'false-accept' : 'abstained', top: label(top) });
    }
  }

  const detail: CardDetail[] = deck.map((card) => {
    const scan = matched.get(card);
    const top = scan && topOf(scan);
    return scan && top ? judged(card, scan, top) : { card: label(card), status: 'no-result' };
  });
  const answered = detail.filter((row) => row.status !== 'no-result');
  const count = (predicate: (row: CardDetail) => boolean) => detail.filter(predicate).length;
  const outsideAccepts = extras.filter((extra) => extra.card === 'not in deck' && extra.status === 'false-accept').length;
  const wrongCardAccepts =
    answered.filter((row) => row.status === 'false-accept' && !row.identity).length + outsideAccepts;
  const startedAt = scans.length > 0 ? scans[0].at - scans[0].endToEndMs : null;
  const elapsedMs = startedAt === null ? 0 : scans[scans.length - 1].at - startedAt;
  const perMinute = (value: number) => (elapsedMs > 0 ? Math.round((value / elapsedMs) * 600_000) / 10 : null);
  const printingTop1 = count((row) => row.status !== 'no-result' && row.printing);

  const summary = {
    presented: deck.length,
    identityTop1: count((row) => row.status !== 'no-result' && row.identity),
    printingTop1,
    correctAccepts: count((row) => row.status === 'correct-accept'),
    falseAccepts: count((row) => row.status === 'false-accept') + outsideAccepts,
    wrongCardAccepts,
    abstentions: count((row) => row.status === 'abstained'),
    failures: extras.filter((extra) => extra.card === 'failed').length,
    endToEndP50Ms: nearestRank(answered.map((row) => row.endToEndMs), 0.5),
    endToEndP95Ms: nearestRank(answered.map((row) => row.endToEndMs), 0.95),
    results: scans.length,
    duplicatePhotos: extras.filter((extra) => extra.card === 'duplicate photo').length,
    notACardResults: extras.filter((extra) => extra.card === 'not a card').length,
    notInDeckResults: extras.filter((extra) => extra.card === 'not in deck').length,
    missedCards: count((row) => row.status === 'no-result'),
    elapsedSeconds: Math.round(elapsedMs / 100) / 10,
    cardsPerMinute: perMinute(scans.length),
    correctCardsPerMinute: perMinute(printingTop1),
  };

  const gates: Gate[] = [
    { name: 'No false accepts', passed: summary.falseAccepts === 0, value: `${summary.falseAccepts}` },
    {
      name: 'Right card first',
      passed: summary.identityTop1 >= deck.length - 1,
      value: `${summary.identityTop1} of ${deck.length}, needs ${deck.length - 1}`,
    },
    {
      name: 'Exact card printing first',
      passed: printingTop1 >= deck.length - 3,
      value: `${printingTop1} of ${deck.length}, needs ${deck.length - 3}`,
    },
    {
      name: 'End-to-end p95 below 1.5 s',
      passed: summary.endToEndP95Ms !== null && summary.endToEndP95Ms < 1_500,
      value: `${summary.endToEndP95Ms} ms`,
    },
  ];

  return { summary, detail, extras, gates, startedAt };
}
