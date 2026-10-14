export type ManaColor = 'generic' | 'white' | 'blue' | 'black' | 'red' | 'green' | 'untap';

export type CardSymbol = {
  spoken: string;
  glyphs: readonly [string] | readonly [string, string];
  colors: readonly [] | readonly [ManaColor] | readonly [ManaColor, ManaColor];
  half?: true;
};

const cardSymbols: Readonly<Record<string, CardSymbol | undefined>> = {
  '{T}': { spoken: 'tap', glyphs: ['\u{e61a}'], colors: ['generic'] },
  '{Q}': { spoken: 'untap', glyphs: ['\u{e61b}'], colors: ['untap'] },
  '{E}': { spoken: 'energy', glyphs: ['\u{e907}'], colors: [] },
  '{P}': { spoken: 'pawprint', glyphs: ['\u{ea32}'], colors: [] },
  '{PW}': { spoken: 'planeswalker', glyphs: ['\u{e623}'], colors: [] },
  '{CHAOS}': { spoken: 'chaos', glyphs: ['\u{e61d}'], colors: [] },
  '{A}': { spoken: 'acorn', glyphs: ['\u{e929}'], colors: [] },
  '{TK}': { spoken: 'ticket', glyphs: ['\u{e9c4}'], colors: [] },
  '{X}': { spoken: 'X generic mana', glyphs: ['\u{e615}'], colors: ['generic'] },
  '{Y}': { spoken: 'Y generic mana', glyphs: ['\u{e616}'], colors: ['generic'] },
  '{Z}': { spoken: 'Z generic mana', glyphs: ['\u{e617}'], colors: ['generic'] },
  '{0}': { spoken: 'zero mana', glyphs: ['\u{e605}'], colors: ['generic'] },
  '{½}': { spoken: 'half generic mana', glyphs: ['\u{e902}'], colors: ['generic'] },
  '{1}': { spoken: 'one generic mana', glyphs: ['\u{e606}'], colors: ['generic'] },
  '{2}': { spoken: 'two generic mana', glyphs: ['\u{e607}'], colors: ['generic'] },
  '{3}': { spoken: 'three generic mana', glyphs: ['\u{e608}'], colors: ['generic'] },
  '{4}': { spoken: 'four generic mana', glyphs: ['\u{e609}'], colors: ['generic'] },
  '{5}': { spoken: 'five generic mana', glyphs: ['\u{e60a}'], colors: ['generic'] },
  '{6}': { spoken: 'six generic mana', glyphs: ['\u{e60b}'], colors: ['generic'] },
  '{7}': { spoken: 'seven generic mana', glyphs: ['\u{e60c}'], colors: ['generic'] },
  '{8}': { spoken: 'eight generic mana', glyphs: ['\u{e60d}'], colors: ['generic'] },
  '{9}': { spoken: 'nine generic mana', glyphs: ['\u{e60e}'], colors: ['generic'] },
  '{10}': { spoken: 'ten generic mana', glyphs: ['\u{e60f}'], colors: ['generic'] },
  '{11}': { spoken: 'eleven generic mana', glyphs: ['\u{e610}'], colors: ['generic'] },
  '{12}': { spoken: 'twelve generic mana', glyphs: ['\u{e611}'], colors: ['generic'] },
  '{13}': { spoken: 'thirteen generic mana', glyphs: ['\u{e612}'], colors: ['generic'] },
  '{14}': { spoken: 'fourteen generic mana', glyphs: ['\u{e613}'], colors: ['generic'] },
  '{15}': { spoken: 'fifteen generic mana', glyphs: ['\u{e614}'], colors: ['generic'] },
  '{16}': { spoken: 'sixteen generic mana', glyphs: ['\u{e62a}'], colors: ['generic'] },
  '{17}': { spoken: 'seventeen generic mana', glyphs: ['\u{e62b}'], colors: ['generic'] },
  '{18}': { spoken: 'eighteen generic mana', glyphs: ['\u{e62c}'], colors: ['generic'] },
  '{19}': { spoken: 'nineteen generic mana', glyphs: ['\u{e62d}'], colors: ['generic'] },
  '{20}': { spoken: 'twenty generic mana', glyphs: ['\u{e62e}'], colors: ['generic'] },
  '{100}': { spoken: 'one hundred generic mana', glyphs: ['\u{e900}'], colors: ['generic'] },
  '{1000000}': { spoken: 'one million generic mana', glyphs: ['\u{e901}'], colors: ['generic'] },
  '{∞}': { spoken: 'infinite generic mana', glyphs: ['\u{e903}'], colors: ['generic'] },
  '{W/U}': { spoken: 'white or blue mana', glyphs: ['\u{e600}', '\u{e601}'], colors: ['white', 'blue'] },
  '{W/B}': { spoken: 'white or black mana', glyphs: ['\u{e600}', '\u{e602}'], colors: ['white', 'black'] },
  '{B/R}': { spoken: 'black or red mana', glyphs: ['\u{e602}', '\u{e603}'], colors: ['black', 'red'] },
  '{B/G}': { spoken: 'black or green mana', glyphs: ['\u{e602}', '\u{e604}'], colors: ['black', 'green'] },
  '{U/B}': { spoken: 'blue or black mana', glyphs: ['\u{e601}', '\u{e602}'], colors: ['blue', 'black'] },
  '{U/R}': { spoken: 'blue or red mana', glyphs: ['\u{e601}', '\u{e603}'], colors: ['blue', 'red'] },
  '{R/G}': { spoken: 'red or green mana', glyphs: ['\u{e603}', '\u{e604}'], colors: ['red', 'green'] },
  '{R/W}': { spoken: 'red or white mana', glyphs: ['\u{e603}', '\u{e600}'], colors: ['red', 'white'] },
  '{G/W}': { spoken: 'green or white mana', glyphs: ['\u{e604}', '\u{e600}'], colors: ['green', 'white'] },
  '{G/U}': { spoken: 'green or blue mana', glyphs: ['\u{e604}', '\u{e601}'], colors: ['green', 'blue'] },
  '{B/G/P}': { spoken: 'Phyrexian black or green mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['black', 'green'] },
  '{B/R/P}': { spoken: 'Phyrexian black or red mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['black', 'red'] },
  '{G/U/P}': { spoken: 'Phyrexian green or blue mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['green', 'blue'] },
  '{G/W/P}': { spoken: 'Phyrexian green or white mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['green', 'white'] },
  '{R/G/P}': { spoken: 'Phyrexian red or green mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['red', 'green'] },
  '{R/W/P}': { spoken: 'Phyrexian red or white mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['red', 'white'] },
  '{U/B/P}': { spoken: 'Phyrexian blue or black mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['blue', 'black'] },
  '{U/R/P}': { spoken: 'Phyrexian blue or red mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['blue', 'red'] },
  '{W/B/P}': { spoken: 'Phyrexian white or black mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['white', 'black'] },
  '{W/U/P}': { spoken: 'Phyrexian white or blue mana', glyphs: ['\u{e618}', '\u{e618}'], colors: ['white', 'blue'] },
  '{C/W}': { spoken: 'colorless or white mana', glyphs: ['\u{e904}', '\u{e600}'], colors: ['generic', 'white'] },
  '{C/U}': { spoken: 'colorless or blue mana', glyphs: ['\u{e904}', '\u{e601}'], colors: ['generic', 'blue'] },
  '{C/B}': { spoken: 'colorless or black mana', glyphs: ['\u{e904}', '\u{e602}'], colors: ['generic', 'black'] },
  '{C/R}': { spoken: 'colorless or red mana', glyphs: ['\u{e904}', '\u{e603}'], colors: ['generic', 'red'] },
  '{C/G}': { spoken: 'colorless or green mana', glyphs: ['\u{e904}', '\u{e604}'], colors: ['generic', 'green'] },
  '{2/W}': { spoken: 'two generic or white mana', glyphs: ['\u{e607}', '\u{e600}'], colors: ['generic', 'white'] },
  '{2/U}': { spoken: 'two generic or blue mana', glyphs: ['\u{e607}', '\u{e601}'], colors: ['generic', 'blue'] },
  '{2/B}': { spoken: 'two generic or black mana', glyphs: ['\u{e607}', '\u{e602}'], colors: ['generic', 'black'] },
  '{2/R}': { spoken: 'two generic or red mana', glyphs: ['\u{e607}', '\u{e603}'], colors: ['generic', 'red'] },
  '{2/G}': { spoken: 'two generic or green mana', glyphs: ['\u{e607}', '\u{e604}'], colors: ['generic', 'green'] },
  '{H}': { spoken: 'Phyrexian mana', glyphs: ['\u{e618}'], colors: ['generic'] },
  '{W/P}': { spoken: 'Phyrexian white mana', glyphs: ['\u{e618}'], colors: ['white'] },
  '{U/P}': { spoken: 'Phyrexian blue mana', glyphs: ['\u{e618}'], colors: ['blue'] },
  '{B/P}': { spoken: 'Phyrexian black mana', glyphs: ['\u{e618}'], colors: ['black'] },
  '{R/P}': { spoken: 'Phyrexian red mana', glyphs: ['\u{e618}'], colors: ['red'] },
  '{G/P}': { spoken: 'Phyrexian green mana', glyphs: ['\u{e618}'], colors: ['green'] },
  '{C/P}': { spoken: 'Phyrexian colorless mana', glyphs: ['\u{e618}'], colors: ['generic'] },
  '{HW}': { spoken: 'half white mana', glyphs: ['\u{e600}'], colors: ['white'], half: true },
  '{HR}': { spoken: 'half red mana', glyphs: ['\u{e603}'], colors: ['red'], half: true },
  '{W}': { spoken: 'white mana', glyphs: ['\u{e600}'], colors: ['white'] },
  '{U}': { spoken: 'blue mana', glyphs: ['\u{e601}'], colors: ['blue'] },
  '{B}': { spoken: 'black mana', glyphs: ['\u{e602}'], colors: ['black'] },
  '{R}': { spoken: 'red mana', glyphs: ['\u{e603}'], colors: ['red'] },
  '{G}': { spoken: 'green mana', glyphs: ['\u{e604}'], colors: ['green'] },
  '{C}': { spoken: 'colorless mana', glyphs: ['\u{e904}'], colors: ['generic'] },
  '{S}': { spoken: 'snow mana', glyphs: ['\u{e619}'], colors: ['generic'] },
  '{L}': { spoken: 'legendary mana', glyphs: ['\u{ea2d}'], colors: ['generic'] },
  '{D}': { spoken: 'land drop', glyphs: ['\u{ea2e}'], colors: [] },
};

export type CardSymbolPart = { text: string; symbol?: CardSymbol };

export function cardSymbolParts(text: string): CardSymbolPart[] {
  return text
    .split(/(\{[^{}]+\})/)
    .filter((piece) => piece !== '')
    .map((piece) => ({ text: piece, symbol: cardSymbols[piece] }));
}

export function spokenCardSymbolText(text: string) {
  return cardSymbolParts(text)
    .map((part, index, parts) => {
      if (!part.symbol) {
        return part.text;
      }
      return parts[index + 1]?.symbol ? `${part.symbol.spoken} ` : part.symbol.spoken;
    })
    .join('');
}
