import type { CardCondition, CollectionQuery } from '@mtgscan/supabase/collection';
import { usdPriceBounds, type ExchangeRate, type PriceBounds } from '@mtgscan/supabase/converted-prices';
import { Constants } from '@mtgscan/supabase/database.types';

import { conditionLabels, conditionNames, conditions, finishes, languageNames, languages } from '@/collection/copy-labels';

type SearchOperator = ':' | '=' | '<' | '<=' | '>' | '>=';

export type SearchChip = {
  key: SearchKeyName;
  negated: boolean;
  operator: SearchOperator;
  value: string;
};

type Choice = { value: string; note?: string };

type ListField = 'names' | 'types' | 'tags' | 'keywords' | 'sets' | 'rarities' | 'finishes' | 'conditions' | 'languages' | 'user_tags';

type ListKey = { kind: 'list'; field: ListField; note: string; choices?: Record<string, Choice> };

type ColorKey = { kind: 'colors'; field: 'colors' | 'identity_subset_of'; note: string; letters: string };

type BoundKey = {
  kind: 'bound';
  min: 'mana_value_min' | 'power_min' | 'toughness_min' | 'price_min';
  max: 'mana_value_max' | 'power_max' | 'toughness_max' | 'price_max';
  note: string;
  pattern: RegExp;
  step: number | 'minor unit';
};

type FlagKey = {
  kind: 'flag';
  flags: Record<string, { field: 'is_commander' | 'is_game_changer' | 'is_free' | 'is_protected'; note: string }>;
};

type SearchKey = ListKey | ColorKey | BoundKey | FlagKey;

function choices(values: readonly string[], noteOf: (value: string) => string | undefined = () => undefined) {
  return Object.fromEntries(values.map((value) => [value, { value, note: noteOf(value) }]));
}

const colorNames: Record<string, string> = {
  w: 'White',
  u: 'Blue',
  b: 'Black',
  r: 'Red',
  g: 'Green',
  c: 'Colorless',
};

export function conditionChipValue(condition: CardCondition) {
  return conditionLabels[condition].toLowerCase();
}

function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const searchKeys = {
  name: { kind: 'list', field: 'names', note: 'Card name' },
  type: { kind: 'list', field: 'types', note: 'Type line' },
  color: { kind: 'colors', field: 'colors', note: 'Colors', letters: 'wubrgc' },
  identity: { kind: 'colors', field: 'identity_subset_of', note: 'Color identity', letters: 'wubrgc' },
  mv: { kind: 'bound', min: 'mana_value_min', max: 'mana_value_max', note: 'Mana value', pattern: /^\d+$/, step: 1 },
  pow: { kind: 'bound', min: 'power_min', max: 'power_max', note: 'Power', pattern: /^\d+$/, step: 1 },
  tou: { kind: 'bound', min: 'toughness_min', max: 'toughness_max', note: 'Toughness', pattern: /^\d+$/, step: 1 },
  price: { kind: 'bound', min: 'price_min', max: 'price_max', note: 'Current price', pattern: /^\d{1,10}(\.\d{1,2})?$/, step: 'minor unit' },
  tag: { kind: 'list', field: 'tags', note: 'Oracle tag' },
  keyword: { kind: 'list', field: 'keywords', note: 'Keyword' },
  set: { kind: 'list', field: 'sets', note: 'Set code' },
  rarity: { kind: 'list', field: 'rarities', note: 'Rarity', choices: choices(Constants.public.Enums.card_rarity) },
  finish: { kind: 'list', field: 'finishes', note: 'Finish', choices: choices(finishes) },
  condition: {
    kind: 'list',
    field: 'conditions',
    note: 'Condition',
    choices: Object.fromEntries(
      conditions.map((condition) => [
        conditionChipValue(condition),
        { value: condition, note: sentenceCase(conditionNames[condition]) },
      ]),
    ),
  },
  lang: { kind: 'list', field: 'languages', note: 'Language', choices: choices(languages, (language) => languageNames[language as keyof typeof languageNames]) },
  user_tag: { kind: 'list', field: 'user_tags', note: 'User tag' },
  is: {
    kind: 'flag',
    flags: {
      commander: { field: 'is_commander', note: 'Can be your commander' },
      gamechanger: { field: 'is_game_changer', note: 'Game Changer' },
      free: { field: 'is_free', note: 'Free copies' },
      protected: { field: 'is_protected', note: 'Protected copies' },
    },
  },
} satisfies Record<string, SearchKey>;

type SearchKeyName = keyof typeof searchKeys;

function searchKeyNamed(name: string) {
  return name in searchKeys ? (name as SearchKeyName) : null;
}

function negatable(searchKey: SearchKey) {
  return searchKey.kind !== 'bound' && !(searchKey.kind === 'colors' && searchKey.field === 'identity_subset_of');
}

const tokenPattern = /^(-?)([a-z_]+)(<=|>=|:|=|<|>)(.*)$/i;

function unquoted(value: string) {
  if (!value.includes('"')) {
    return value;
  }
  return /^"[^"]+"$/.test(value) ? value.slice(1, -1) : '';
}

function checkedValue(key: SearchKey, operator: SearchOperator, value: string) {
  switch (key.kind) {
    case 'list':
      if (operator !== ':') {
        return null;
      }
      if (key.choices) {
        return key.choices[value.toLowerCase()] ? value.toLowerCase() : null;
      }
      return value;
    case 'colors': {
      const letters = value.toLowerCase();
      return operator === ':' && [...letters].every((letter) => key.letters.includes(letter)) ? letters : null;
    }
    case 'bound':
      return key.pattern.test(value) ? value : null;
    case 'flag':
      return operator === ':' && key.flags[value.toLowerCase()] ? value.toLowerCase() : null;
  }
}

function parsedToken(token: string) {
  const match = tokenPattern.exec(token);
  const key = match && searchKeyNamed(match[2].toLowerCase());
  if (!match || !key) {
    return null;
  }
  const searchKey: SearchKey = searchKeys[key];
  const negated = match[1] === '-';
  return negated && !negatable(searchKey)
    ? null
    : { key, searchKey, negated, operator: match[3] as SearchOperator, value: match[4] };
}

function chipOf(token: string): SearchChip | null {
  const parsed = parsedToken(token);
  const value = parsed && unquoted(parsed.value);
  if (!parsed || !value) {
    return null;
  }
  const checked = checkedValue(parsed.searchKey, parsed.operator, value);
  return checked === null ? null : { key: parsed.key, negated: parsed.negated, operator: parsed.operator, value: checked };
}

function isKeyToken(token: string) {
  return tokenPattern.test(token) && searchKeyNamed(tokenPattern.exec(token)![2].toLowerCase()) !== null;
}

export function chipLabel({ key, negated, operator, value }: SearchChip) {
  return `${negated ? '-' : ''}${key}${operator}${/\s/.test(value) ? `"${value}"` : value}`;
}

function insideQuotes(text: string) {
  return (text.match(/"/g)?.length ?? 0) % 2 === 1;
}

function splitTokens(text: string) {
  return text.match(/(?:"[^"]*"?|\S)+/g) ?? [];
}

export function splitLastToken(text: string) {
  let start = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') {
      quoted = !quoted;
    } else if (!quoted && /\s/.test(text[index])) {
      start = index + 1;
    }
  }
  return { before: text.slice(0, start), token: text.slice(start) };
}

export function committedChip(text: string) {
  const { before, token } = splitLastToken(text.trimEnd());
  const chip = chipOf(token);
  return chip && { before, chip };
}

export function chipBeforeSpace(text: string) {
  return /\s$/.test(text) && !insideQuotes(text) ? committedChip(text) : null;
}

type Bounds = Partial<Record<BoundKey['min'] | BoundKey['max'], number>>;

function boundOf(step: number, operator: SearchOperator, value: number) {
  switch (operator) {
    case '<':
      return { max: value - step };
    case '<=':
      return { max: value };
    case '>':
      return { min: value + step };
    case '>=':
      return { min: value };
    default:
      return { min: value, max: value };
  }
}

export function collectionSearchQuery(text: string, chips: SearchChip[], priceCurrency: ExchangeRate) {
  const query: Record<string, unknown> = {};
  const minorUnit = 10 ** -priceCurrency.minor_unit_digits;
  const chipIndexOfField = new Map<string, number>();
  const bounds: Bounds = {};
  const words = splitTokens(text)
    .filter((token) => !isKeyToken(token))
    .join(' ');
  if (words) {
    query.text = words;
  }

  function addToList(field: string, values: string[], chipIndex: number) {
    const list = (query[field] as string[] | undefined) ?? [];
    values.forEach((_, index) => chipIndexOfField.set(`${field}[${list.length + index}]`, chipIndex));
    query[field] = [...list, ...values];
  }

  chips.forEach((chip, chipIndex) => {
    const key: SearchKey = searchKeys[chip.key];
    switch (key.kind) {
      case 'list':
        addToList(chip.negated ? `${key.field}_exclude` : key.field, [key.choices?.[chip.value].value ?? chip.value], chipIndex);
        break;
      case 'colors': {
        const letters = key.field === 'identity_subset_of' ? chip.value.replaceAll('c', '') : chip.value;
        const colors = [...new Set(letters.toUpperCase())];
        const field = chip.negated ? `${key.field}_exclude` : key.field;
        if (colors.length === 0) {
          query[field] = [];
          chipIndexOfField.set(field, chipIndex);
        } else {
          addToList(field, colors, chipIndex);
        }
        break;
      }
      case 'bound': {
        const { min, max } = boundOf(key.step === 'minor unit' ? minorUnit : key.step, chip.operator, Number(chip.value));
        if (min !== undefined && !(bounds[key.min]! >= min)) {
          bounds[key.min] = min;
          chipIndexOfField.set(key.min, chipIndex);
        }
        if (max !== undefined && !(bounds[key.max]! <= max)) {
          bounds[key.max] = max;
          chipIndexOfField.set(key.max, chipIndex);
        }
        break;
      }
      case 'flag': {
        const { field } = key.flags[chip.value];
        query[field] = !chip.negated;
        chipIndexOfField.set(field, chipIndex);
        break;
      }
    }
  });

  const priceBounds: PriceBounds = {};
  for (const [field, bound] of Object.entries(bounds)) {
    if (field === 'price_min' || field === 'price_max') {
      priceBounds[field] = bound.toFixed(priceCurrency.minor_unit_digits);
    } else {
      query[field] = bound;
    }
  }
  Object.assign(query, usdPriceBounds(priceBounds, priceCurrency));
  return { query: query as CollectionQuery, chipIndexOfField };
}

export function refusedChipMessage(chip: SearchChip) {
  switch (chip.key) {
    case 'set':
      return `No set named "${chip.value}".`;
    case 'tag':
      return `No Oracle tag named "${chip.value}".`;
    case 'keyword':
      return `No keyword named "${chip.value}".`;
    case 'user_tag':
      return `No user tag named "${chip.value}".`;
    default:
      return `${chipLabel(chip)} is not a valid chip.`;
  }
}

export type SearchSuggestion = {
  title: string;
  detail?: string;
  chip?: SearchChip;
};

export type TypedValue = { key: SearchKeyName; negated: boolean; value: string };

export function keyValueChip(key: SearchKeyName, value: string, negated = false): SearchChip {
  return { key, negated, operator: ':', value };
}

export function chipSuggestion(typed: TypedValue, value: string, detail?: string): SearchSuggestion {
  const chip = keyValueChip(typed.key, value, typed.negated);
  return { title: chipLabel(chip), detail, chip };
}

function keySuggestions(negated: boolean): SearchSuggestion[] {
  const minus = negated ? '-' : '';
  return (Object.entries(searchKeys) as [SearchKeyName, SearchKey][])
    .filter(([, searchKey]) => !negated || negatable(searchKey))
    .flatMap(([key, searchKey]): SearchSuggestion[] => {
      switch (searchKey.kind) {
        case 'flag':
          return Object.entries(searchKey.flags).map(([value, flag]) => chipSuggestion({ key, negated, value: '' }, value, flag.note));
        case 'bound':
          return [{ title: key, detail: searchKey.note }];
        default:
          return [{ title: `${minus}${key}:`, detail: searchKey.note }];
      }
    });
}

export function typedValue(token: string): TypedValue | null {
  const parsed = parsedToken(token);
  if (!parsed || parsed.operator !== ':' || parsed.searchKey.kind === 'bound') {
    return null;
  }
  return { key: parsed.key, negated: parsed.negated, value: parsed.value.replace(/^"/, '') };
}

export function fixedSuggestions(token: string): SearchSuggestion[] {
  const typed = typedValue(token);
  if (!typed) {
    const word = token.replace(/^-/, '').toLowerCase();
    if (!word || /[:<>="]/.test(word)) {
      return [];
    }
    return keySuggestions(token.startsWith('-')).filter((suggestion) => suggestion.title.replace(/^-/, '').startsWith(word));
  }
  const searchKey: SearchKey = searchKeys[typed.key];
  const options: [string, string | undefined][] =
    searchKey.kind === 'list'
      ? Object.entries(searchKey.choices ?? {}).map(([value, choice]) => [value, choice.note])
      : searchKey.kind === 'colors'
        ? [...searchKey.letters].map((letter) => [letter, colorNames[letter]])
        : searchKey.kind === 'flag'
          ? Object.entries(searchKey.flags).map(([value, flag]) => [value, flag.note])
          : [];
  const prefix = typed.value.toLowerCase();
  return options.filter(([value]) => value.startsWith(prefix)).map(([value, note]) => chipSuggestion(typed, value, note));
}
