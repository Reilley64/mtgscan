import type { CopyDetails } from '@mtgscan/supabase/collection';
import { convertedPrice, type ExchangeRate } from '@mtgscan/supabase/converted-prices';
import { View } from 'react-native';

import { commanderLegalityLabels, copyChipLabels, sheenOf } from '@/collection/copy-labels';
import { changeSinceAdded, shownPriceChange, spokenPriceChange } from '@/collection/price-change';
import { priceLabels, type PriceAmount } from '@/collection/price-currency-labels';
import { priceCredit } from '@/collection/total-labels';
import { Chip } from '@/components/atoms/chip';
import { DeckTag } from '@/components/atoms/deck-tag';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { CardHero } from '@/components/molecules/card-hero';
import { DisclosureRow } from '@/components/molecules/disclosure-row';
import { PriceLine } from '@/components/molecules/price-line';
import { SheetSection } from '@/components/molecules/sheet-section';
import { SymbolText } from '@/components/molecules/symbol-text';
import { ValueRow } from '@/components/molecules/value-row';
import { shownDay } from '@/lib/shown-day';

function PriceRow({ label, price }: { label: string; price: (PriceAmount & { stale?: boolean }) | null }) {
  const { shown, stale, spoken } = priceLabels(price);
  return (
    <ValueRow label={label} spokenValue={spoken} accessibilityHint={stale ? 'The price may be out of date.' : undefined}>
      <PriceLine price={shown} stale={stale} />
    </ValueRow>
  );
}

function SinceAddedRow({ price, purchaseDayPrice }: { price: PriceAmount | null; purchaseDayPrice: PriceAmount | null }) {
  const change = changeSinceAdded(price, purchaseDayPrice);
  return (
    <ValueRow label="Since added" spokenValue={change ? spokenPriceChange(change) : 'no price'}>
      <PriceLine price={change && shownPriceChange(change)} stale={false} />
    </ValueRow>
  );
}

function TextRow({ label, value }: { label: string; value: string }) {
  return (
    <ValueRow label={label} spokenValue={value}>
      <Text>{value}</Text>
    </ValueRow>
  );
}

function OracleText({ faces }: Pick<CopyDetails, 'faces'>) {
  const shownFaces = faces.filter((face) => face.oracle_text !== '');
  if (shownFaces.length === 0) {
    return null;
  }
  return (
    <Surface className="gap-md">
      {shownFaces.map((face, index) => (
        <View key={index} className="gap-xs">
          {faces.length > 1 ? <Text variant="body-strong">{face.name}</Text> : null}
          <SymbolText text={face.oracle_text} />
        </View>
      ))}
    </Surface>
  );
}

function UserTagsRow({ userTags, onPress }: { userTags: CopyDetails['user_tags']; onPress: () => void }) {
  if (userTags.length === 0) {
    return (
      <DisclosureRow accessibilityLabel="Add user tags" onPress={onPress}>
        <Text className="text-text-muted">Add user tags</Text>
      </DisclosureRow>
    );
  }
  return (
    <DisclosureRow accessibilityLabel={['User tags', ...userTags.map((userTag) => userTag.name)].join(', ')} onPress={onPress}>
      <View className="flex-row flex-wrap gap-sm">
        {userTags.map((userTag) => (
          <Chip key={userTag.user_tag_id} label={userTag.name} />
        ))}
      </View>
    </DisclosureRow>
  );
}

type CopyPageContentProps = {
  copy: CopyDetails;
  priceCurrency: ExchangeRate;
  onOpenUserTags: () => void;
  onOpenDeck: (deckId: string) => void;
};

export function CopyPageContent({ copy, priceCurrency, onOpenUserTags, onOpenDeck }: CopyPageContentProps) {
  const legality = commanderLegalityLabels[copy.commander_legality];
  const price = copy.price && convertedPrice(copy.price, priceCurrency);
  const purchaseDayPrice = copy.purchase_day_price && convertedPrice(copy.purchase_day_price, priceCurrency);
  const credit = priceCredit(price ?? purchaseDayPrice ?? { currency: priceCurrency.currency });
  const deckTag = copy.deck ?? copy.held_for;
  return (
    <>
      <CardHero
        uri={copy.image_uris[0]}
        artUri={copy.art_crop_uri ?? copy.image_uris[0]}
        name={copy.name}
        sheen={sheenOf(copy.finish)}
      />
      <View className="gap-lg px-lg">
        <View className="gap-xs">
          <Text variant="card-title">{copy.name}</Text>
          <Text className="text-text-muted">{copy.type_line}</Text>
        </View>
        <View className="flex-row flex-wrap gap-sm">
          {copy.protected ? <Chip tone="warning" symbol="shield.fill" label="Protected" /> : null}
          {copy.held_for ? <Chip tone="info" symbol="bookmark.fill" label="Held" /> : null}
          {copyChipLabels(copy).map((label, index) => (
            <Chip key={index} label={label} />
          ))}
        </View>
        {deckTag ? (
          <DeckTag name={deckTag.name} commanderArtUri={deckTag.commander_art_crop_uri} onPress={() => onOpenDeck(deckTag.deck_id)} />
        ) : null}
        <SheetSection title="User tags">
          <UserTagsRow userTags={copy.user_tags} onPress={onOpenUserTags} />
        </SheetSection>
        <SheetSection title="Price">
          <PriceRow label="Current price" price={price} />
          <TextRow label="Added" value={shownDay(copy.added_at)} />
          <PriceRow label="Purchase-day price" price={purchaseDayPrice} />
          <SinceAddedRow price={price} purchaseDayPrice={purchaseDayPrice} />
          {credit ? <Text variant="credit">{credit}</Text> : null}
        </SheetSection>
        <SheetSection title="Rules">
          <OracleText faces={copy.faces} />
          <TextRow label="Commander" value={legality} />
        </SheetSection>
      </View>
    </>
  );
}
