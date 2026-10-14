import type { CopyDetails } from '@mtgscan/supabase/collection';
import type { PriceCurrency } from '@mtgscan/supabase/search';
import { View } from 'react-native';

import { commanderLegalityLabels, copyChipLabels, sheenOf, shownPrice } from '@/collection/copy-labels';
import { changeSinceAdded, shownPriceChange, spokenPriceChange } from '@/collection/price-change';
import { priceCredit } from '@/collection/total-labels';
import { Chip } from '@/components/atoms/chip';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { CardHero } from '@/components/molecules/card-hero';
import { DisclosureRow } from '@/components/molecules/disclosure-row';
import { PriceLine } from '@/components/molecules/price-line';
import { SheetSection } from '@/components/molecules/sheet-section';
import { SymbolText } from '@/components/molecules/symbol-text';
import { ValueRow } from '@/components/molecules/value-row';
import { shownDay } from '@/lib/shown-day';

function PriceRow({ label, price, stale }: { label: string; price: string | undefined; stale: boolean }) {
  return (
    <ValueRow
      label={label}
      spokenValue={price ?? 'no price'}
      accessibilityHint={stale ? 'The price may be out of date.' : undefined}>
      <PriceLine price={price} stale={stale} />
    </ValueRow>
  );
}

function SinceAddedRow({ price, purchaseDayPrice }: { price: CopyDetails['price']; purchaseDayPrice: CopyDetails['purchase_day_price'] }) {
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
  currency: PriceCurrency;
  onOpenUserTags: () => void;
};

export function CopyPageContent({ copy, currency, onOpenUserTags }: CopyPageContentProps) {
  const legality = commanderLegalityLabels[copy.commander_legality];
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
          {copyChipLabels(copy).map((label, index) => (
            <Chip key={index} label={label} />
          ))}
        </View>
        <SheetSection title="User tags">
          <UserTagsRow userTags={copy.user_tags} onPress={onOpenUserTags} />
        </SheetSection>
        <SheetSection title="Price">
          <PriceRow
            label="Current price"
            price={copy.price ? shownPrice(copy.price) : undefined}
            stale={copy.price?.stale ?? false}
          />
          <TextRow label="Added" value={shownDay(copy.added_at)} />
          <PriceRow
            label="Purchase-day price"
            price={copy.purchase_day_price ? shownPrice(copy.purchase_day_price) : undefined}
            stale={false}
          />
          <SinceAddedRow price={copy.price} purchaseDayPrice={copy.purchase_day_price} />
          <Text variant="credit">{priceCredit({ currency })}</Text>
        </SheetSection>
        <SheetSection title="Rules">
          <OracleText faces={copy.faces} />
          <TextRow label="Commander" value={legality} />
        </SheetSection>
      </View>
    </>
  );
}
