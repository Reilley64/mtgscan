import type { GalleryCardPrinting, GalleryParity } from '../../modules/card-recognizer';
import { developmentLogPrefixes } from '../../src/lib/development-log';
import { nearestRank } from '../../src/scan/capture-log';
import type { RecognitionLogLine } from '../../src/scan/recognition-log';

export type TestDeckCard = Pick<GalleryCardPrinting, 'printingId' | 'name' | 'setCode' | 'collectorNumber'>;

type Judged = {
  card: string;
  status: 'correct-accept' | 'false-accept' | 'abstained';
  identity: boolean;
  printing: boolean;
  top: string;
  endToEndMs: number;
};

type CardResult = Judged | { card: string; status: 'failed'; endToEndMs: number } | { card: string; status: 'no-result' };

type OtherResult = {
  card: 'duplicate photo' | 'not a card' | 'not in deck';
  status: 'duplicate' | 'not-a-card' | 'false-accept' | 'abstained';
  top: string;
};

const ansiCodes = /\u001b\[[0-9;]*m/g;

export function testDeckCards(tsv: string): TestDeckCard[] {
  return tsv
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [printingId, name, setCode, collectorNumber] = line.split('\t');
      return { printingId, name, setCode: setCode.toLowerCase(), collectorNumber };
    });
}

function logLines<T>(metroLog: string, prefix: string): T[] {
  return metroLog.split('\n').flatMap((raw) => {
    const line = raw.replace(ansiCodes, '');
    const start = line.indexOf(`${prefix}{`);
    return start < 0 ? [] : [JSON.parse(line.slice(start + prefix.length)) as T];
  });
}

function label(card: TestDeckCard) {
  return `${card.name} ${card.setCode.toUpperCase()} #${card.collectorNumber}`;
}

function firstCandidate(recognition: RecognitionLogLine): TestDeckCard | null {
  return recognition.kind === 'card' ? (recognition.candidates[0] ?? null) : null;
}

function accepted(recognition: RecognitionLogLine) {
  return recognition.kind === 'card' && recognition.decision.accepted;
}

function sameCard(a: TestDeckCard, b: TestDeckCard) {
  return a.name.toLowerCase() === b.name.toLowerCase();
}

function repeatsPrevious(top: TestDeckCard, previous: TestDeckCard | undefined, current: TestDeckCard | undefined) {
  if (!previous || top.printingId === current?.printingId) {
    return false;
  }
  return top.printingId === previous.printingId || (sameCard(top, previous) && !(current && sameCard(top, current)));
}

function judged(card: TestDeckCard, recognition: RecognitionLogLine): CardResult {
  const top = firstCandidate(recognition);
  if (!top) {
    return { card: label(card), status: 'failed', endToEndMs: recognition.endToEndMs };
  }
  const printing = top.printingId === card.printingId;
  return {
    card: label(card),
    status: !accepted(recognition) ? 'abstained' : printing ? 'correct-accept' : 'false-accept',
    identity: sameCard(top, card),
    printing,
    top: label(top),
    endToEndMs: recognition.endToEndMs,
  };
}

function matchToDeck(deck: TestDeckCard[], recognitions: RecognitionLogLine[]) {
  const cards: CardResult[] = [];
  const others: OtherResult[] = [];
  for (const recognition of recognitions) {
    const top = firstCandidate(recognition);
    const previous = deck[cards.length - 1];
    const current = deck[cards.length];
    if (recognition.kind === 'not_a_card') {
      others.push({ card: 'not a card', status: 'not-a-card', top: 'none' });
    } else if (top && previous && repeatsPrevious(top, previous, current)) {
      const wrongPrinting = accepted(recognition) && top.printingId !== previous.printingId;
      others.push({ card: 'duplicate photo', status: wrongPrinting ? 'false-accept' : 'duplicate', top: label(top) });
    } else if (current) {
      cards.push(judged(current, recognition));
    } else {
      others.push({ card: 'not in deck', status: accepted(recognition) ? 'false-accept' : 'abstained', top: top ? label(top) : 'none' });
    }
  }
  const missed = deck.slice(cards.length).map((card): CardResult => ({ card: label(card), status: 'no-result' }));
  return { cards: [...cards, ...missed], others };
}

function summarize(deck: TestDeckCard[], cards: CardResult[], others: OtherResult[], results: number) {
  const scored = cards.filter((card): card is Judged => 'identity' in card);
  const timed = cards.flatMap((card) => ('endToEndMs' in card ? [card.endToEndMs] : [])).sort((a, b) => a - b);
  const cardsWith = (status: CardResult['status']) => cards.filter((card) => card.status === status).length;
  const othersWith = (kind: OtherResult['card'], status?: OtherResult['status']) =>
    others.filter((other) => other.card === kind && (status === undefined || other.status === status)).length;
  const otherFalseAccepts = others.filter((other) => other.status === 'false-accept').length;
  return {
    presented: deck.length,
    identityTop1: scored.filter((card) => card.identity).length,
    printingTop1: scored.filter((card) => card.printing).length,
    correctAccepts: cardsWith('correct-accept'),
    falseAccepts: cardsWith('false-accept') + otherFalseAccepts,
    wrongCardAccepts:
      scored.filter((card) => card.status === 'false-accept' && !card.identity).length +
      othersWith('not in deck', 'false-accept'),
    abstentions: cardsWith('abstained'),
    failures: cardsWith('failed'),
    endToEndP50Ms: timed.length > 0 ? nearestRank(timed, 0.5) : null,
    endToEndP95Ms: timed.length > 0 ? nearestRank(timed, 0.95) : null,
    results,
    duplicatePhotos: othersWith('duplicate photo'),
    notACardResults: othersWith('not a card'),
    notInDeckResults: othersWith('not in deck'),
    missedCards: cardsWith('no-result'),
  };
}

type Summary = ReturnType<typeof summarize>;

function releaseGates(deck: TestDeckCard[], summary: Summary) {
  return [
    { name: 'No false accepts', passed: summary.falseAccepts === 0, value: `${summary.falseAccepts}` },
    {
      name: 'Right card first',
      passed: summary.identityTop1 >= deck.length - 1,
      value: `${summary.identityTop1} of ${deck.length}, needs ${deck.length - 1}`,
    },
    {
      name: 'Exact card printing first',
      passed: summary.printingTop1 >= deck.length - 3,
      value: `${summary.printingTop1} of ${deck.length}, needs ${deck.length - 3}`,
    },
    {
      name: 'End-to-end p95 below 1.5 s',
      passed: summary.endToEndP95Ms !== null && summary.endToEndP95Ms < 1_500,
      value: `${summary.endToEndP95Ms} ms`,
    },
  ];
}

export function scoreBinDeck(deck: TestDeckCard[], metroLog: string) {
  const recognitions = logLines<RecognitionLogLine>(metroLog, developmentLogPrefixes.recognition);
  const parity = logLines<GalleryParity>(metroLog, developmentLogPrefixes.parity).at(-1) ?? null;
  const { cards, others } = matchToDeck(deck, recognitions);
  const summary = summarize(deck, cards, others, recognitions.length);
  const [first] = recognitions;
  return {
    summary,
    cards,
    others,
    parity,
    gates: releaseGates(deck, summary),
    startedAt: first ? first.at - first.endToEndMs : null,
  };
}
