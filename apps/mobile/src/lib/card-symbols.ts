export type ManaColor = 'generic' | 'white' | 'blue' | 'black' | 'red' | 'green';

export type SymbolCircle = 'none' | 'untap' | readonly [ManaColor] | readonly [ManaColor, ManaColor];

export type CardSymbol = {
  spoken: string;
  glyphs: readonly [string] | readonly [string, string];
  circle: SymbolCircle;
  half?: true;
};

type Color = 'W' | 'U' | 'B' | 'R' | 'G';

const colorGlyphs: Record<Color, string> = { W: '\u{e600}', U: '\u{e601}', B: '\u{e602}', R: '\u{e603}', G: '\u{e604}' };
const colorNames: Record<Color, Exclude<ManaColor, 'generic'>> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
const colors = Object.keys(colorGlyphs) as Color[];
const hybridPairs: readonly [Color, Color][] = [
  ['W', 'U'],
  ['W', 'B'],
  ['U', 'B'],
  ['U', 'R'],
  ['B', 'R'],
  ['B', 'G'],
  ['R', 'G'],
  ['R', 'W'],
  ['G', 'W'],
  ['G', 'U'],
];
const phyrexianGlyph = '\u{e618}';
const twoGlyph = '\u{e607}';
const colorlessGlyph = '\u{e904}';

const genericSymbols: readonly [string, string, string][] = [
  ['{X}', '\u{e615}', 'X generic mana'],
  ['{Y}', '\u{e616}', 'Y generic mana'],
  ['{Z}', '\u{e617}', 'Z generic mana'],
  ['{0}', '\u{e605}', 'zero mana'],
  ['{½}', '\u{e902}', 'half generic mana'],
  ['{1}', '\u{e606}', 'one generic mana'],
  ['{2}', '\u{e607}', 'two generic mana'],
  ['{3}', '\u{e608}', 'three generic mana'],
  ['{4}', '\u{e609}', 'four generic mana'],
  ['{5}', '\u{e60a}', 'five generic mana'],
  ['{6}', '\u{e60b}', 'six generic mana'],
  ['{7}', '\u{e60c}', 'seven generic mana'],
  ['{8}', '\u{e60d}', 'eight generic mana'],
  ['{9}', '\u{e60e}', 'nine generic mana'],
  ['{10}', '\u{e60f}', 'ten generic mana'],
  ['{11}', '\u{e610}', 'eleven generic mana'],
  ['{12}', '\u{e611}', 'twelve generic mana'],
  ['{13}', '\u{e612}', 'thirteen generic mana'],
  ['{14}', '\u{e613}', 'fourteen generic mana'],
  ['{15}', '\u{e614}', 'fifteen generic mana'],
  ['{16}', '\u{e62a}', 'sixteen generic mana'],
  ['{17}', '\u{e62b}', 'seventeen generic mana'],
  ['{18}', '\u{e62c}', 'eighteen generic mana'],
  ['{19}', '\u{e62d}', 'nineteen generic mana'],
  ['{20}', '\u{e62e}', 'twenty generic mana'],
  ['{100}', '\u{e900}', 'one hundred generic mana'],
  ['{1000000}', '\u{e901}', 'one million generic mana'],
  ['{∞}', '\u{e903}', 'infinite generic mana'],
];

const bareSymbols: readonly [string, string, string][] = [
  ['{E}', '\u{e907}', 'energy'],
  ['{P}', '\u{ea32}', 'pawprint'],
  ['{PW}', '\u{e623}', 'planeswalker'],
  ['{CHAOS}', '\u{e61d}', 'chaos'],
  ['{A}', '\u{e929}', 'acorn'],
  ['{TK}', '\u{e9c4}', 'ticket'],
  ['{D}', '\u{ea2e}', 'land drop'],
];

const otherGenericSymbols: readonly [string, string, string][] = [
  ['{T}', '\u{e61a}', 'tap'],
  ['{C}', colorlessGlyph, 'colorless mana'],
  ['{S}', '\u{e619}', 'snow mana'],
  ['{L}', '\u{ea2d}', 'legendary mana'],
  ['{H}', phyrexianGlyph, 'Phyrexian mana'],
  ['{C/P}', phyrexianGlyph, 'Phyrexian colorless mana'],
];

function entriesOfColor(color: Color): [string, CardSymbol][] {
  const name = colorNames[color];
  return [
    [`{${color}}`, { spoken: `${name} mana`, glyphs: [colorGlyphs[color]], circle: [name] }],
    [`{${color}/P}`, { spoken: `Phyrexian ${name} mana`, glyphs: [phyrexianGlyph], circle: [name] }],
    [`{2/${color}}`, { spoken: `two generic or ${name} mana`, glyphs: [twoGlyph, colorGlyphs[color]], circle: ['generic', name] }],
    [`{C/${color}}`, { spoken: `colorless or ${name} mana`, glyphs: [colorlessGlyph, colorGlyphs[color]], circle: ['generic', name] }],
  ];
}

function entriesOfPair([first, second]: readonly [Color, Color]): [string, CardSymbol][] {
  const circle = [colorNames[first], colorNames[second]] as const;
  const names = `${colorNames[first]} or ${colorNames[second]} mana`;
  return [
    [`{${first}/${second}}`, { spoken: names, glyphs: [colorGlyphs[first], colorGlyphs[second]], circle }],
    [`{${first}/${second}/P}`, { spoken: `Phyrexian ${names}`, glyphs: [phyrexianGlyph, phyrexianGlyph], circle }],
  ];
}

const cardSymbols: ReadonlyMap<string, CardSymbol> = new Map([
  ...genericSymbols.map(([token, glyph, spoken]): [string, CardSymbol] => [token, { spoken, glyphs: [glyph], circle: ['generic'] }]),
  ...otherGenericSymbols.map(([token, glyph, spoken]): [string, CardSymbol] => [token, { spoken, glyphs: [glyph], circle: ['generic'] }]),
  ...bareSymbols.map(([token, glyph, spoken]): [string, CardSymbol] => [token, { spoken, glyphs: [glyph], circle: 'none' }]),
  ['{Q}', { spoken: 'untap', glyphs: ['\u{e61b}'], circle: 'untap' }],
  ...colors.flatMap(entriesOfColor),
  ...hybridPairs.flatMap(entriesOfPair),
  ...(['W', 'R'] as const).map((color): [string, CardSymbol] => [
    `{H${color}}`,
    { spoken: `half ${colorNames[color]} mana`, glyphs: [colorGlyphs[color]], circle: [colorNames[color]], half: true },
  ]),
]);

export type CardSymbolPart = { text: string; symbol?: CardSymbol };

export function cardSymbolParts(text: string): CardSymbolPart[] {
  return text
    .split(/(\{[^{}]+\})/)
    .filter((piece) => piece !== '')
    .map((piece) => ({ text: piece, symbol: cardSymbols.get(piece) }));
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
