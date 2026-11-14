import {
  aspectRatios,
  gradients,
  printedCardCornerPerWidth,
  sizes,
  spacing,
  rounded,
  typography,
} from "../apps/mobile/src/theme";
import { cardSymbols } from "../apps/mobile/src/lib/card-symbols";
import { typeGroups, rarityGroups, highestManaValueGroup } from "../apps/mobile/src/decks/deck-groups";
import { colorNames } from "../apps/mobile/src/decks/deck-labels";
import { deckNameLength } from "../supabase/decks";
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
console.log(`  static let deckTypes: [String] = [${typeGroups.map(({ type }) => quoted(type)).join(", ")}]`);
console.log(`  static let deckTypeTitles: [String] = [${typeGroups.map(({ title }) => quoted(title)).join(", ")}]`);
console.log(`  static let deckRarities: [String: String] = ${dictionary(rarityGroups)}`);
console.log(`  static let deckColors: [String: String] = ${dictionary(colorNames)}`);
console.log(`  static let highestDeckManaValue: Int = ${highestManaValueGroup}`);
console.log(`  static let deckNameLength: Int = ${deckNameLength}`);
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
  commanderGalleryHeight: sizes.commanderGalleryCard,
  deckBannerHeight: sizes.deckBanner,
  headerClearance: sizes.headerClearance,
  floatingButtonSize: sizes.floatingButton,
  floatingButtonClearance: sizes.floatingButtonClearance,
  iconButtonSymbolSize: sizes.iconButtonSymbol,
  countBadgeSize: sizes.countBadge,
  countBadgeFontSize: typography.chip.fontSize,
  countBadgeFontWeight: {
    "100": -0.8,
    "200": -0.6,
    "300": -0.4,
    "400": 0,
    "500": 0.23,
    "600": 0.3,
    "700": 0.4,
    "800": 0.56,
    "900": 0.62,
  }[typography.chip.fontWeight],
  commanderAvatar: sizes.commanderAvatar,
  bannerCommanderAvatar: sizes.bannerCommanderAvatar,
  commanderCorner: rounded.md,
  commanderTopInset: spacing.xl,
  manaSymbolSize: sizes.manaSymbol,
  manaSymbolFontSize: typography.manaSymbol.fontSize,
  manaSymbolSplitFontSize: typography.manaSymbolSplit.fontSize,
  manaSymbolBareFontSize: typography.manaSymbolBare.fontSize,
  manaSymbolSplitInset: sizes.manaSymbolSplitInset,
})) {
  console.log(`  static let ${name}: Double = ${value}`);
}
for (const name of ["foilSheen", "etchedSheen", "commanderArtScrim"] as const) {
  const stops = [
    ...gradients[name].matchAll(/(transparent|rgba\([^)]+\)|#[0-9a-f]{8}) ([\d.]+)%/g),
  ].map((match) => {
    const rgba =
      match[1] === "transparent"
        ? [0, 0, 0, 0]
        : match[1].startsWith("#")
          ? [...match[1].slice(1).matchAll(/../g)].map((part, index) => Number.parseInt(part[0], 16) / (index === 3 ? 255 : 1))
          : match[1].slice(5, -1).split(",").map(Number);
    return `NativeSheenStop(rgba: [${rgba.join(", ")}], location: ${Number(match[2]) / 100})`;
  });
  console.log(
    `  static let ${name}: [NativeSheenStop] = [${stops.join(", ")}]`,
  );
}
console.log("}");
