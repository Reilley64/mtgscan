import type { Database } from '../database.types';
import type { ScryfallCard } from './scryfall-bulk-data';

export type DeckConstructionFields = {
  has_partner: boolean | null;
  partner_text: string | null;
  partner_with_name: string | null;
  has_choose_a_background: boolean | null;
  has_doctors_companion: boolean | null;
  commander_chooses_a_color: boolean | null;
  copy_limit: Database['public']['Enums']['copy_limit'];
  copy_limit_number: number | null;
};

type AbilityReading = RegExpExecArray | 'absent' | 'unknown';

const numberWords: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const partnerWithLine = /^Partner with (.+)$/;

function abilityLines(card: ScryfallCard): string[] {
  return (card.card_faces ?? [card]).flatMap((face) =>
    (face.oracle_text ?? '')
      .split('\n')
      .map((line) => line.replace(/\s*\([^()]*\)/g, '').replace(/^[^—]+ — /, '').trim()),
  );
}

function readAbility(lines: string[], ability: RegExp, mention: RegExp): AbilityReading {
  for (const line of lines) {
    const match = ability.exec(line);
    if (match) {
      return match;
    }
  }
  return lines.some((line) => mention.test(line)) ? 'unknown' : 'absent';
}

function hasAbility(reading: AbilityReading): boolean | null {
  return reading === 'unknown' ? null : reading !== 'absent';
}

function abilityText(reading: AbilityReading): string | null {
  return typeof reading === 'string' ? null : (reading[1] ?? null);
}

function readCopyLimit(lines: string[]): Pick<DeckConstructionFields, 'copy_limit' | 'copy_limit_number'> {
  const mentions = lines.filter((line) => /deck can have/i.test(line));
  if (mentions.length === 0) {
    return { copy_limit: 'one', copy_limit_number: null };
  }
  if (mentions.length > 1) {
    return { copy_limit: 'unknown', copy_limit_number: null };
  }
  const line = mentions[0]!;
  if (/^A deck can have only one card named .+\.$/.test(line)) {
    return { copy_limit: 'one', copy_limit_number: null };
  }
  if (/^A deck can have any number of cards named .+\.$/.test(line)) {
    return { copy_limit: 'any_number', copy_limit_number: null };
  }
  const number = numberWords[/^A deck can have up to (\w+) cards named .+\.$/.exec(line)?.[1] ?? ''];
  return number
    ? { copy_limit: 'number', copy_limit_number: number }
    : { copy_limit: 'unknown', copy_limit_number: null };
}

export function deckConstructionFields(card: ScryfallCard): DeckConstructionFields {
  const lines = abilityLines(card);
  const partner = readAbility(
    lines.filter((line) => !partnerWithLine.test(line)),
    /^Partner(?:—(.+))?$/,
    /\bpartner\b/i,
  );
  return {
    has_partner: hasAbility(partner),
    partner_text: abilityText(partner),
    partner_with_name: lines.map((line) => partnerWithLine.exec(line)?.[1]).find(Boolean) ?? null,
    has_choose_a_background: hasAbility(readAbility(lines, /^Choose a Background$/, /choose a background/i)),
    has_doctors_companion: hasAbility(readAbility(lines, /^Doctor's companion$/, /doctor's companion/i)),
    commander_chooses_a_color: hasAbility(
      readAbility(
        lines,
        /^If (.+) is your commander, choose a color before the game begins\. \1 is the chosen color\.$/,
        /your commander.*(choose a color|color of your choice)/i,
      ),
    ),
    ...readCopyLimit(lines),
  };
}
