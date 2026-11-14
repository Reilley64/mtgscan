import {
  aspectRatios,
  gradients,
  printedCardCornerPerWidth,
  sizes,
  typography,
} from "../apps/mobile/src/theme";
import { cardSymbols } from "../apps/mobile/src/lib/card-symbols";
import {
  commanderLegalityLabels,
  conditionLabels,
  conditionNames,
  finishLabels,
  languageNames,
} from "../apps/mobile/src/collection/copy-labels";

const quoted = (value: string) => JSON.stringify(value);
const dictionary = (values: Record<string, string>) =>
  "[" +
  Object.entries(values)
    .map(([key, value]) => `${quoted(key)}: ${quoted(value)}`)
    .join(", ") +
  "]";

console.log("import Foundation\n\nenum PresentationData {");
for (const [name, values] of Object.entries({
  commanderLegalityLabels,
  conditionLabels,
  conditionNames,
  finishLabels,
  languageNames,
})) {
  console.log(`  static let ${name}: [String: String] = ${dictionary(values)}`);
}
console.log("  static let symbols: [String: NativeCardSymbol] = [");
for (const [token, symbol] of cardSymbols) {
  const circle = Array.isArray(symbol.circle)
    ? `.colors([${symbol.circle.map(quoted).join(", ")}])`
    : symbol.circle === "untap"
      ? ".untap"
      : ".none";
  console.log(
    `    ${quoted(token)}: NativeCardSymbol(spoken: ${quoted(symbol.spoken)}, glyphs: [${symbol.glyphs.map(quoted).join(", ")}], circle: ${circle}, half: ${Boolean(symbol.half)}),`,
  );
}
console.log("  ]");
console.log(
  `  static let cardImageAspectRatio: Double = ${aspectRatios.cardImage}`,
);
for (const [name, value] of Object.entries({
  printedCardCornerPerWidth,
  manaSymbolSize: sizes.manaSymbol,
  manaSymbolFontSize: typography.manaSymbol.fontSize,
  manaSymbolSplitFontSize: typography.manaSymbolSplit.fontSize,
  manaSymbolBareFontSize: typography.manaSymbolBare.fontSize,
  manaSymbolSplitInset: sizes.manaSymbolSplitInset,
  skeletonTitleBar: sizes.skeletonTitleBar,
  skeletonMetaBar: sizes.skeletonMetaBar,
})) {
  console.log(`  static let ${name}: Double = ${value}`);
}
for (const name of ["foilSheen", "etchedSheen", "setArtScrim"] as const) {
  const stops = [
    ...gradients[name].matchAll(
      /(transparent|rgba\([^)]+\)|#[0-9a-f]{8}) ([\d.]+)%/g,
    ),
  ].map((match) => {
    const rgba =
      match[1] === "transparent"
        ? [0, 0, 0, 0]
        : match[1].startsWith("#")
          ? [1, 3, 5, 7].map(
              (start, index) =>
                parseInt(match[1].slice(start, start + 2), 16) /
                (index === 3 ? 255 : 1),
            )
          : match[1].slice(5, -1).split(",").map(Number);
    return `NativeSheenStop(rgba: [${rgba.join(", ")}], location: ${Number(match[2]) / 100})`;
  });
  console.log(
    `  static let ${name}: [NativeSheenStop] = [${stops.join(", ")}]`,
  );
}
console.log("}");
