import type { CopyDetails } from '@mtgscan/supabase/collection';
import type { PriceCurrency } from '@mtgscan/supabase/search';
import { View } from 'react-native';

import { commanderLegalityLabels, conditionLabels, finishLabels, languageNames, shownPrice } from '@/collection/copy-labels';
import { priceCredit } from '@/collection/total-labels';
import { Chip } from '@/components/atoms/chip';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { CardHero } from '@/components/molecules/card-hero';
import { PriceLine } from '@/components/molecules/price-line';
import { SheetSection } from '@/components/molecules/sheet-section';
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
          <Text>{face.oracle_text}</Text>
        </View>
      ))}
    </Surface>
  );
}

export function CopyPageContent({ copy, currency }: { copy: CopyDetails; currency: PriceCurrency }) {
  const legality = commanderLegalityLabels[copy.commander_legality];
  return (
    <>
      <CardHero uri={copy.image_uris[0]} name={copy.name} sheen={copy.finish === 'nonfoil' ? undefined : copy.finish} />
      <View className="gap-lg px-lg">
        <View className="gap-xs">
          <Text variant="card-title">{copy.name}</Text>
          <Text className="text-text-muted">{copy.type_line}</Text>
        </View>
        <View className="flex-row flex-wrap gap-sm">
          {copy.protected ? <Chip tone="warning" symbol="shield.fill" label="Protected" /> : null}
          <Chip label={copy.set.toUpperCase()} />
          <Chip label={copy.collector_number} />
          {copy.finish === 'nonfoil' ? null : <Chip label={finishLabels[copy.finish]} />}
          <Chip label={conditionLabels[copy.condition]} />
          <Chip label={languageNames[copy.language]} />
        </View>
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
