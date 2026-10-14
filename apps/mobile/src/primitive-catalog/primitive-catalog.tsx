import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { AppleSignInButton } from '@/components/atoms/apple-sign-in-button';
import { Button } from '@/components/atoms/button';
import { GoogleSignInButton } from '@/components/atoms/google-sign-in-button';
import { CardImage } from '@/components/atoms/card-image';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { Chip } from '@/components/atoms/chip';
import { CountBadge } from '@/components/atoms/count-badge';
import { DimSymbol } from '@/components/atoms/dim-symbol';
import { GlassGroup } from '@/components/atoms/glass-surface';
import { Input } from '@/components/atoms/input';
import { ProgressBar } from '@/components/atoms/progress-bar';
import { QuickActionButton } from '@/components/atoms/quick-action-button';
import { SetIcon } from '@/components/atoms/set-icon';
import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { TextLink } from '@/components/atoms/text-link';
import { Toggle } from '@/components/atoms/toggle';
import { AccountCard } from '@/components/molecules/account-card';
import { BatchButton } from '@/components/molecules/batch-button';
import { Brand } from '@/components/molecules/brand';
import { CardGrid, CardGridSkeleton } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { ChipGroup } from '@/components/molecules/chip-group';
import { CopyMeta } from '@/components/molecules/copy-meta';
import { PriceLine } from '@/components/molecules/price-line';
import { PullIndicator } from '@/components/molecules/pull-indicator';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { GalleryCard } from '@/components/molecules/gallery-card';
import { ListRow } from '@/components/molecules/list-row';
import { QuickActionBar } from '@/components/molecules/quick-action-bar';
import { SheetSection } from '@/components/molecules/sheet-section';
import { SwipeToConfirm } from '@/components/molecules/swipe-to-confirm';
import { SwitchRow } from '@/components/molecules/switch-row';
import { ThumbnailChip } from '@/components/molecules/thumbnail-chip';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { colors, sizes } from '@/theme';

const m10Symbol = 'https://svgs.scryfall.io/sets/m10.svg';

const solRing = 'https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446';

const conditions = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;

const cardPageSections = ['Copies', 'Decks', 'Prices', 'Rules'] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-sm">
      <Text variant="sheet-title">{title}</Text>
      {children}
    </View>
  );
}

function TextStyles() {
  return (
    <Section title="Text styles">
      <Text variant="large-title">Large title</Text>
      <Text variant="sign-in-title">Sign-in title</Text>
      <Text variant="brand">Brand</Text>
      <Text variant="card-title">Card title</Text>
      <Text variant="sheet-title">Sheet title</Text>
      <Text>Body</Text>
      <Text variant="body-strong">Body strong</Text>
      <Text variant="meta">Meta</Text>
      <Text variant="price">Price</Text>
      <Text variant="chip">Chip</Text>
      <Text variant="credit">Credit</Text>
      <Text variant="meta">
        Meta with a <TextLink onPress={() => {}}>Text link</TextLink>
      </Text>
    </Section>
  );
}

function Buttons() {
  return (
    <Section title="Buttons">
      <Button variant="primary" onPress={() => {}}>
        <Text>Add to collection</Text>
      </Button>
      <Button onPress={() => {}}>
        <Text>Dismiss</Text>
      </Button>
      <Button variant="danger" onPress={() => {}}>
        <Text>Remove scan</Text>
      </Button>
      <Button variant="primary" disabled onPress={() => {}}>
        <Text>Disabled</Text>
      </Button>
      <Button variant="primary" busy onPress={() => {}}>
        <Text>Busy</Text>
      </Button>
      <Button size="icon" accessibilityLabel="Settings" onPress={() => {}}>
        <SymbolView name="gearshape.fill" size={18} tintColor={colors.text} />
      </Button>
    </Section>
  );
}

function SignInButtons() {
  return (
    <Section title="Sign-in buttons">
      <AppleSignInButton busy={false} disabled={false} onPress={() => {}} />
      <AppleSignInButton busy={false} disabled onPress={() => {}} />
      <AppleSignInButton busy disabled={false} onPress={() => {}} />
      <GoogleSignInButton busy={false} disabled={false} onPress={() => {}} />
      <GoogleSignInButton busy disabled={false} onPress={() => {}} />
      <Button size="sign-in" disabled onPress={() => {}}>
        <Text>Sign-in disabled</Text>
      </Button>
      <Button variant="primary" size="sign-in" onPress={() => {}}>
        <Text>Try again</Text>
      </Button>
    </Section>
  );
}

function Chips() {
  const [condition, setCondition] = useState<(typeof conditions)[number]>('NM');
  return (
    <Section title="Chips">
      <View className="flex-row flex-wrap gap-sm">
        <Chip label="Valid" />
        <Chip tone="warning" label="Protected only" />
        <Chip tone="danger" label="Not valid" />
        <Chip tone="info" label="Bracket 3" />
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <Chip label="set:mh2" onRemove={() => {}} />
        <Chip tone="danger" label="set:zzz" onRemove={() => {}} />
      </View>
      <ChipGroup values={conditions} selected={condition} labelOf={(value) => value} onSelect={setCondition} />
    </Section>
  );
}

function Toggles() {
  const [protect, setProtect] = useState(false);
  const [section, setSection] = useState<(typeof cardPageSections)[number]>('Copies');
  return (
    <Section title="Toggles">
      <View className="flex-row gap-sm">
        <Toggle pressed={protect} onPressedChange={setProtect}>
          <Text>Protect</Text>
        </Toggle>
        <Toggle pressed onPressedChange={() => {}}>
          <Text>On</Text>
        </Toggle>
        <Toggle pressed={false} disabled onPressedChange={() => {}}>
          <Text>Disabled</Text>
        </Toggle>
      </View>
      <ToggleGroup
        values={cardPageSections}
        selected={section}
        labelOf={(value) => value}
        onSelect={setSection}
      />
    </Section>
  );
}

function Surfaces() {
  return (
    <Section title="Surfaces">
      <Surface className="gap-xs">
        <Text variant="body-strong">Signed in with Apple</Text>
        <Text variant="meta">you@example.com</Text>
      </Surface>
      <Surface onPress={() => {}}>
        <Text variant="body-strong">Surface with an action</Text>
      </Surface>
      <AccountCard provider="Apple" email="you@example.com" />
      <GalleryCard date="12 October 2026" status="Up to date" />
      <GalleryCard date={null} status={null} />
      <FailureNotice message="Sign-in did not work." />
      <FailureNotice message="Could not add to your collection. Your scans are kept." />
    </Section>
  );
}

function ListRows() {
  return (
    <Section title="List rows">
      <ListRow title="Sol Ring" detail="CMM 464" leading={<CardThumbnail uri={solRing} />} onPress={() => {}} />
      <ListRow title="Lightning Bolt" onPress={() => {}} />
      <ListRow title="Gallery" detail="Up to date" />
    </Section>
  );
}

function CardTiles() {
  const [chosen, setChosen] = useState('CMM 464');
  return (
    <Section title="Card tiles">
      <CardGrid>
        <CardTile uri={solRing} sheen="foil" accessibilityLabel="Sol Ring, M10 216, foil, lightly played, $1,635.37">
          <CopyMeta setCode="m10" rarity="mythic" setIconUri={m10Symbol} collectorNumber="216" condition="LP" />
          <PriceLine price="$1,635.37" stale={false} />
        </CardTile>
        <CardTile uri={solRing} sheen="etched" accessibilityLabel="Sol Ring, C21 263, etched, no price">
          <CopyMeta setCode="c21" rarity="rare" setIconUri={undefined} collectorNumber="263" />
          <PriceLine price={undefined} stale={false} />
        </CardTile>
        <CardTile uri={solRing} accessibilityLabel="Sol Ring, M10 216, $1.25" accessibilityHint="The price may be out of date.">
          <CopyMeta setCode="m10" rarity="uncommon" setIconUri={m10Symbol} collectorNumber="216" />
          <PriceLine price="$1.25" stale />
        </CardTile>
        {['CMM 464', 'C21 263'].map((caption) => (
          <CardTile
            key={caption}
            uri={solRing}
            caption={caption}
            accessibilityLabel={`Sol Ring, ${caption}`}
            selected={chosen === caption}
            onPress={() => setChosen(caption)}
          />
        ))}
      </CardGrid>
    </Section>
  );
}

function Switches() {
  const [scanSounds, setScanSounds] = useState(true);
  return (
    <Section title="Switches">
      <SwitchRow title="Scan sounds" value={scanSounds} onValueChange={setScanSounds} />
    </Section>
  );
}

function CountBadges() {
  return (
    <Section title="Count badges">
      <View className="flex-row items-center gap-lg">
        <CountBadge count={3} />
        <CountBadge count={128} />
        <BatchButton count={12} onPress={() => {}} />
        <BatchButton count={0} onPress={() => {}} />
      </View>
    </Section>
  );
}

function QuickActions() {
  return (
    <Section title="Quick actions">
      <QuickActionBar>
        <QuickActionButton label="Nonfoil" />
        <QuickActionButton label="LP" onPress={() => {}} />
        <QuickActionButton label="M10" onPress={() => {}}>
          <SetIcon uri={m10Symbol} />
        </QuickActionButton>
        <QuickActionButton label="JA" onPress={() => {}} />
        <QuickActionButton label="+1" onPress={() => {}} />
      </QuickActionBar>
    </Section>
  );
}

function Skeletons() {
  return (
    <Section title="Skeletons">
      <Skeleton className="h-card-thumbnail-height w-card-thumbnail-width" />
      <Skeleton className="h-skeleton-title-bar w-[70%]" />
      <CardGridSkeleton accessibilityLabel="Loading collection" />
    </Section>
  );
}

function Glass() {
  return (
    <Section title="Glass">
      <View>
        <CardImage uri={solRing} />
        <View className="absolute inset-x-md top-md items-end">
          <BatchButton count={3} onPress={() => {}} />
        </View>
        <View className="absolute inset-x-md bottom-md">
          <GlassGroup className="gap-sm">
            <ThumbnailChip
              accessibilityLabel="Sol Ring, CMM 464, Foil"
              onPress={() => {}}
              thumbnail={<CardThumbnail uri={solRing} />}
              accessory={<DimSymbol name="chevron.right" size={sizes.chevron} />}>
              <Text variant="body-strong" className="text-center">
                Sol Ring
              </Text>
              <Text variant="meta" className="text-center">
                CMM 464 · Foil
              </Text>
            </ThumbnailChip>
            <ThumbnailChip
              accessibilityLabel="Recognizing card"
              accessibilityRole="progressbar"
              thumbnail={<Skeleton className="h-card-thumbnail-height w-card-thumbnail-width" />}>
              <View className="items-center">
                <Skeleton className="h-skeleton-title-bar w-[70%]" />
              </View>
            </ThumbnailChip>
            <QuickActionBar>
              <QuickActionButton label="Finish" />
              <QuickActionButton label="Set">
                <DimSymbol name="square.dashed" size={sizes.setIcon} />
              </QuickActionButton>
              <QuickActionButton label="+1" onPress={() => {}} />
            </QuickActionBar>
          </GlassGroup>
        </View>
      </View>
    </Section>
  );
}

function PullIndicators() {
  return (
    <Section title="Pull indicators">
      <View className="items-center gap-sm">
        <PullIndicator label="Pull to add 3 cards" kind="pull" />
        <PullIndicator label="Release to add 3 cards" kind="release" />
        <PullIndicator label="Nothing to add" kind="pull" />
        <PullIndicator label="Adding 3 cards" kind="adding" />
        <PullIndicator label="Failed to add" kind="failed" />
      </View>
    </Section>
  );
}

function Inputs() {
  const [name, setName] = useState('');
  return (
    <Section title="Inputs">
      <Input accessibilityLabel="Card name" placeholder="Card name" value={name} onChangeText={setName} />
    </Section>
  );
}

function ProgressBars() {
  return (
    <Section title="Progress bars">
      <ProgressBar label="Downloading gallery" value={12.3} max={68.5} />
    </Section>
  );
}

function SwipeToConfirms() {
  return (
    <Section title="Swipe to confirm">
      <SwipeToConfirm label="Swipe to confirm" onConfirm={async () => false} />
      <SwipeToConfirm label="Swipe busy" busy onConfirm={async () => false} />
      <SwipeToConfirm label="Swipe disabled" disabled onConfirm={async () => false} />
      <SwipeToConfirm label="Swipe busy and disabled" busy disabled onConfirm={async () => false} />
    </Section>
  );
}

function SheetSections() {
  return (
    <Section title="Sheet sections">
      <SheetSection title="Other options">
        <ListRow title="Lightning Bolt" detail="M10 146" leading={<CardThumbnail uri={solRing} />} />
      </SheetSection>
    </Section>
  );
}

export function PrimitiveCatalog() {
  return (
    <View className="flex-1 bg-background pt-safe">
      <ScrollView className="flex-1" contentContainerClassName="gap-xl px-lg pb-safe-offset-xl pt-sm">
        <Text variant="large-title">Primitives</Text>
        <TextStyles />
        <Section title="Brand">
          <Brand />
        </Section>
        <Buttons />
        <SignInButtons />
        <Chips />
        <Toggles />
        <Surfaces />
        <ListRows />
        <CardTiles />
        <Switches />
        <CountBadges />
        <QuickActions />
        <Skeletons />
        <Glass />
        <PullIndicators />
        <Inputs />
        <ProgressBars />
        <SheetSections />
        <SwipeToConfirms />
        <Section title="Drawer sheet">
          <Button onPress={() => router.push('/primitives-sheet')}>
            <Text>Open the drawer sheet</Text>
          </Button>
          <Button onPress={() => router.push('/primitives-full-height-sheet')}>
            <Text>Open the full-height drawer sheet</Text>
          </Button>
        </Section>
      </ScrollView>
    </View>
  );
}
