import { deckNameLength } from '@mtgscan/supabase/decks';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { AppleSignInButton } from '@/components/atoms/apple-sign-in-button';
import { Button } from '@/components/atoms/button';
import { GoogleSignInButton } from '@/components/atoms/google-sign-in-button';
import { CardImage } from '@/components/atoms/card-image';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { Chip, StatusChipButton } from '@/components/atoms/chip';
import { CommanderAvatar } from '@/components/atoms/commander-avatar';
import { CountBadge } from '@/components/atoms/count-badge';
import { DeckTag } from '@/components/atoms/deck-tag';
import { DimSymbol } from '@/components/atoms/dim-symbol';
import { GlassGroup } from '@/components/atoms/glass-surface';
import { Input } from '@/components/atoms/input';
import { MenuButton } from '@/components/atoms/menu-button';
import { NameAlert } from '@/components/atoms/name-alert';
import { ProgressBar } from '@/components/atoms/progress-bar';
import { QuickActionButton } from '@/components/atoms/quick-action-button';
import { SetIcon } from '@/components/atoms/set-icon';
import { Skeleton } from '@/components/atoms/skeleton';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { TextLink } from '@/components/atoms/text-link';
import { Toggle } from '@/components/atoms/toggle';
import { AccountCard } from '@/components/molecules/account-card';
import { ActionRow } from '@/components/molecules/action-row';
import { BatchButton } from '@/components/molecules/batch-button';
import { Brand } from '@/components/molecules/brand';
import { CardGrid, CardGridSkeleton } from '@/components/molecules/card-grid';
import { CardHero } from '@/components/molecules/card-hero';
import { LargeCardImage } from '@/components/molecules/large-card-image';
import { ReadFailure } from '@/components/molecules/read-failure';
import { BracketSignalRow } from '@/components/molecules/bracket-signal-row';
import { RuleRow } from '@/components/molecules/rule-row';
import { CardTile } from '@/components/molecules/card-tile';
import { ChangeLine } from '@/components/molecules/change-line';
import { Reason } from '@/components/molecules/reason';
import { CommanderGalleryCard, CommanderGalleryCardSkeletons, DeckBanner, DeckBannerSkeleton } from '@/components/molecules/commander-card';
import { CardChip } from '@/components/molecules/card-chip';
import { ChipGroup, SelectableChips } from '@/components/molecules/chip-group';
import { CopyMeta } from '@/components/molecules/copy-meta';
import { DisclosureRow } from '@/components/molecules/disclosure-row';
import { EmptyState } from '@/components/molecules/empty-state';
import {
  DashedCardFrame,
  EmptyBinderSlots,
  GhostBatchRows,
  GhostCommanderCard,
  GhostNeedsYouItems,
} from '@/components/molecules/empty-state-illustrations';
import { PriceLine } from '@/components/molecules/price-line';
import { PullIndicator } from '@/components/molecules/pull-indicator';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { GalleryCard } from '@/components/molecules/gallery-card';
import { ListRow } from '@/components/molecules/list-row';
import { NeedsYouItemSkeletons } from '@/components/molecules/needs-you-skeleton';
import { QuickActionBar } from '@/components/molecules/quick-action-bar';
import { SheetSection } from '@/components/molecules/sheet-section';
import { GroupButton } from '@/components/molecules/group-button';
import { SortButton } from '@/components/molecules/sort-button';
import { StepperRow } from '@/components/molecules/stepper-row';
import { ValueRow } from '@/components/molecules/value-row';
import { SwipeToConfirm } from '@/components/molecules/swipe-to-confirm';
import { WarningLine } from '@/components/molecules/warning-line';
import { SwitchRow } from '@/components/molecules/switch-row';
import { SymbolText } from '@/components/molecules/symbol-text';
import { ThumbnailChip } from '@/components/molecules/thumbnail-chip';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { colors, sizes } from '@/theme';

const m10Symbol = 'https://svgs.scryfall.io/sets/m10.svg';

const solRing = 'https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446';
const solRingArtCrop = 'https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446';

const solRingCommander = { copy_id: 'sol-ring', name: 'Sol Ring', art_crop_uri: solRingArtCrop };

const conditions = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;

const cardPageSections = ['Copies', 'Decks', 'Prices', 'Rules'] as const;

const deckSections = ['Cards', 'Planned', 'History'] as const;

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
        <Chip tone="warning" symbol="shield.fill" label="Protected" />
        <Chip tone="info" symbol="bookmark.fill" label="Held" />
        <Chip tone="info" label="Bracket 3" stale accessibilityHint="The rules data may be out of date." />
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <StatusChipButton symbol="checkmark" label="Valid" accessibilityLabel="Deck validity, Valid" onPress={() => {}} />
        <StatusChipButton tone="danger" symbol="nosign" label="Invalid" accessibilityLabel="Deck validity, Invalid" onPress={() => {}} />
        <StatusChipButton
          tone="warning"
          symbol="questionmark"
          label="Cannot be determined"
          accessibilityLabel="Deck validity, Cannot be determined"
          onPress={() => {}}
        />
        <StatusChipButton
          tone="danger"
          symbol="nosign"
          label="Invalid"
          stale
          accessibilityLabel="Deck validity, Invalid"
          accessibilityHint="The rules data may be out of date."
          onPress={() => {}}
        />
      </View>
      <View className="flex-row flex-wrap gap-sm">
        <Chip label="set:mh2" onRemove={() => {}} />
        <Chip tone="danger" label="set:zzz" onRemove={() => {}} />
      </View>
      <ChipGroup values={conditions} selected={condition} labelOf={(value) => value} onSelect={setCondition} />
      <SelectableChips
        chips={[
          { label: 'Signed', selected: true, onPress: () => {} },
          { label: 'Trade binder', selected: true, onPress: () => {} },
          { label: 'Sold', selected: false, onPress: () => {} },
        ]}
      />
    </Section>
  );
}

function Toggles() {
  const [protect, setProtect] = useState(false);
  const [section, setSection] = useState<(typeof cardPageSections)[number]>('Copies');
  const [deckSection, setDeckSection] = useState<(typeof deckSections)[number]>('Cards');
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
      <ToggleGroup
        values={deckSections}
        selected={deckSection}
        labelOf={(value) => value}
        countOf={(value) => (value === 'Planned' ? 2 : 0)}
        onSelect={setDeckSection}
      />
    </Section>
  );
}

function CardSymbols() {
  return (
    <Section title="Card symbols">
      <SymbolText text="{T}: Add {C}{C}. Spend {X}{2}{W}{U}{B}{R}{G} or {S}." />
      <SymbolText text="{W/U}{B/G}{2/W}{C/R} hybrid, {G/P}{W/U/P}{H} Phyrexian, {Q} untap, {HW} half." />
      <SymbolText text="You get {E}{E}. {A} {TK} {PW} {CHAOS} {P} {D}. Unknown {FOO} stays text." />
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
      <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this card" onTryAgain={() => {}} />
    </Section>
  );
}

function ListRows() {
  return (
    <Section title="List rows">
      <ListRow title="Sol Ring" detail="CMM 464" leading={<CardThumbnail uri={solRing} />} onPress={() => {}} />
      <ListRow
        title="Sol Ring"
        detail="CMM 464 · NM · English"
        trailing={{ content: <PriceLine price="$1.25" stale />, spoken: '$1.25' }}
        leading={<CardThumbnail uri={solRing} />}
        onPress={() => {}}
      />
      <ListRow
        title="Sol Ring"
        detail="C21 263 · NM · English"
        trailing={{ content: <PriceLine price={undefined} stale={false} />, spoken: 'no price' }}
        leading={<CardThumbnail uri={solRing} />}
        onPress={() => {}}
      />
      <View className="flex-row items-center justify-center gap-xs">
        <Text variant="meta">M10 146 ·</Text>
        <PriceLine price="$1.87" stale={false} tone="meta" />
      </View>
      <ListRow
        title="Atraxa"
        detail="Medium priority · 62 cards"
        leading={<CommanderAvatar uri={solRingArtCrop} size="row" />}
        onPress={() => {}}
      />
      <ListRow title="Kinnan" detail="High priority · 0 cards" leading={<CommanderAvatar uri={null} size="row" />} onPress={() => {}} />
      <ListRow
        title="Tymna"
        detail="Medium priority · 100 cards"
        status={{ chip: { label: 'Would make it invalid', tone: 'danger' }, spoken: 'Would make Tymna invalid: deck size' }}
        leading={<CommanderAvatar uri={solRingArtCrop} size="row" />}
        onPress={() => {}}
      />
      <ListRow title="Lightning Bolt" onPress={() => {}} />
      <ListRow title="Gallery" detail="Up to date" />
      <ListRow title="Signed" detail="3 copies" checked onPress={() => {}} />
      <ListRow title="Trade binder" detail="1 copy" checked={false} onPress={() => {}} />
      <ListRow
        title="Misprint"
        detail="0 copies"
        checked={false}
        onPress={() => {}}
        menu={
          <MenuButton
            accessibilityLabel="More, Misprint"
            actions={[
              { title: 'Rename', symbol: 'pencil', onSelect: () => {} },
              { title: 'Delete user tag', symbol: 'trash', destructive: true, onSelect: () => {} },
            ]}
          />
        }
      />
      <DisclosureRow accessibilityLabel="User tags, signed, trade binder" onPress={() => {}}>
        <View className="flex-row flex-wrap gap-sm">
          <Chip label="signed" />
          <Chip label="trade binder" />
        </View>
      </DisclosureRow>
      <DisclosureRow accessibilityLabel="Add user tags" onPress={() => {}}>
        <Text className="text-text-muted">Add user tags</Text>
      </DisclosureRow>
      <Surface>
        <ActionRow title="MCP server URL" detail="https://abcdefghijklmnop.supabase.co/functions/v1/mcp" action={{ label: 'Copy', onPress: () => {} }} />
      </Surface>
      <Surface>
        <ActionRow
          title="ChatGPT"
          detail="Allowed 16 October 2026"
          action={{ label: 'Revoke', variant: 'danger', onPress: () => {} }}
        />
      </Surface>
      <Surface>
        <ActionRow title="Claude" detail="Allowed 3 October 2026" action={{ label: 'Revoke', variant: 'danger', busy: true, onPress: () => {} }} />
      </Surface>
      <Surface>
        <ActionRow
          title="Added"
          badge={{ content: <Chip label="Reverted" />, spoken: 'Reverted' }}
          detail="16 October 2026 at 18:05"
          action={{ label: 'Revert', variant: 'danger', onPress: () => {} }}
        />
      </Surface>
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
        <CardTile uri={solRing} accessibilityLabel="Sol Ring, M10 216, protected, $1.25">
          <CopyMeta setCode="m10" rarity="rare" setIconUri={m10Symbol} collectorNumber="216" isProtected />
          <PriceLine price="$1.25" stale={false} />
        </CardTile>
        <CardTile uri={solRing} accessibilityLabel="Sol Ring, M10 216, protected, in the deck Atraxa, $1.25">
          <CopyMeta setCode="m10" rarity="rare" setIconUri={m10Symbol} collectorNumber="216" isProtected inDeck />
          <PriceLine price="$1.25" stale={false} />
        </CardTile>
        <CardTile uri={solRing} accessibilityLabel="Sol Ring, C21 263, in the deck Atraxa, $1.25">
          <CopyMeta setCode="c21" rarity="rare" setIconUri={undefined} collectorNumber="263" inDeck />
          <PriceLine price="$1.25" stale={false} />
        </CardTile>
        <CardTile uri={solRing} accessibilityLabel="Sol Ring, M10 216, held for the deck Krenko, $1.25">
          <CopyMeta setCode="m10" rarity="rare" setIconUri={m10Symbol} collectorNumber="216" isHeld />
          <PriceLine price="$1.25" stale={false} />
        </CardTile>
        <CardTile uri={solRing} sheen="foil" accessibilityLabel="Sol Ring, M10 216, foil, deck card" onPress={() => {}} />
        <CardTile
          uri={solRing}
          accessibilityLabel="Sol Ring, M10 216, long press for a menu"
          menuActions={[
            { title: 'Open card', symbol: 'rectangle.portrait', onSelect: () => {} },
            { title: 'Make commander', symbol: 'crown', onSelect: () => {} },
            { title: 'Remove from deck', symbol: 'minus.circle', destructive: true, onSelect: () => {} },
          ]}
          onPress={() => {}}
        />
        <CardTile uri={solRing} unlimited accessibilityLabel="Island, basic land, unlimited" onPress={() => {}} />
        <CardTile uri={solRing} accessibilityLabel="Sol Ring, C21 263" inViolation onPress={() => {}} />
        <CardTile
          uri={solRing}
          accessibilityLabel="Mountain, long press for a menu"
          menuActions={[{ title: 'Remove from deck', symbol: 'minus.circle', destructive: true, onSelect: () => {} }]}
          inViolation
        />
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

function ValueRows() {
  return (
    <Section title="Value rows">
      <ValueRow label="Current price" spokenValue="$1.25" accessibilityHint="The price may be out of date.">
        <PriceLine price="$1.25" stale />
      </ValueRow>
      <ValueRow label="Purchase-day price" spokenValue="no price">
        <PriceLine price={undefined} stale={false} />
      </ValueRow>
      <ValueRow label="Added" spokenValue="12 October 2026">
        <Text>12 October 2026</Text>
      </ValueRow>
    </Section>
  );
}

function CardHeroes() {
  return (
    <Section title="Card heroes">
      <View className="-mx-lg">
        <CardHero uri={solRing} artUri={solRingArtCrop} name="Sol Ring" sheen="foil" />
      </View>
      <View className="items-center">
        <LargeCardImage uri={solRing} name="Sol Ring, large" />
      </View>
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

function BasicLandStepperRow({ name, initial }: { name: string; initial: number }) {
  const [count, setCount] = useState(initial);
  return <StepperRow uri={solRing} label={name} value={count} min={0} max={99} onChange={setCount} />;
}

function StepperRows() {
  return (
    <Section title="Stepper rows">
      <BasicLandStepperRow name="Plains" initial={0} />
      <BasicLandStepperRow name="Island" initial={8} />
      <BasicLandStepperRow name="Swamp" initial={99} />
    </Section>
  );
}

function CountBadges() {
  return (
    <Section title="Count badges">
      <View className="flex-row items-center gap-lg">
        <CountBadge count={3} />
        <CountBadge count={128} />
        <CountBadge count="∞" />
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
      <DeckBannerSkeleton />
      <CommanderGalleryCardSkeletons />
      <NeedsYouItemSkeletons />
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
              accessibilityLabel="Sol Ring, CMM 464, Foil, $1.25"
              onPress={() => {}}
              thumbnail={<CardThumbnail uri={solRing} />}
              accessory={<DimSymbol name="chevron.right" size={sizes.chevron} />}>
              <Text variant="body-strong" className="text-center">
                Sol Ring
              </Text>
              <View className="flex-row items-center justify-center gap-xs">
                <Text variant="meta">CMM 464 · Foil ·</Text>
                <PriceLine price="$1.25" stale tone="meta" />
              </View>
            </ThumbnailChip>
            <ThumbnailChip
              accessibilityLabel="Sol Ring, C21 263, no price"
              onPress={() => {}}
              thumbnail={<CardThumbnail uri={solRing} />}
              accessory={<DimSymbol name="chevron.right" size={sizes.chevron} />}>
              <Text variant="body-strong" className="text-center">
                Sol Ring
              </Text>
              <View className="flex-row items-center justify-center gap-xs">
                <Text variant="meta">C21 263 ·</Text>
                <PriceLine price={undefined} stale={false} tone="meta" />
              </View>
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

const groupings = [
  { grouping: 'type', title: 'Type' },
  { grouping: 'mana_value', title: 'Mana value' },
] as const;

const sorts = [
  { sort: 'relevance', title: 'Relevance' },
  { sort: 'price', title: 'Price' },
] as const;

function FloatingMenuButtons() {
  const [grouping, setGrouping] = useState<(typeof groupings)[number]['grouping']>('type');
  const [sort, setSort] = useState<(typeof sorts)[number]['sort']>('relevance');
  return (
    <Section title="Floating menu buttons">
      <View className="flex-row gap-sm">
        <GroupButton groupings={[...groupings]} grouping={grouping} active={grouping !== 'type'} onSelect={setGrouping} />
        <SortButton
          sorts={[...sorts]}
          order={sort === 'price' ? { sort, direction: 'desc' } : { sort }}
          spokenOrder={sort === 'price' ? 'Price, high to low' : 'Relevance'}
          active={sort !== 'relevance'}
          onSelect={setSort}
        />
        <SortButton sorts={[...sorts]} order={{ sort: 'price', direction: 'desc' }} spokenOrder="Price, high to low" active onSelect={() => {}} />
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

function EmptyStates() {
  return (
    <Section title="Empty states">
      <EmptyState
        illustration={<EmptyBinderSlots rows={2} />}
        title="Your collection is empty"
        message="Scan cards to add them to your collection."
        action={{ label: 'Scan cards', onPress: () => {} }}
      />
      <EmptyState illustration={<GhostNeedsYouItems />} title="Nothing needs you yet" message="Planned swaps and buylist cards from your AI chat show up here." />
      <EmptyState illustration={<GhostCommanderCard />} title="No decks yet" message="Create a deck, then add cards to it from your collection." />
      <View className="bg-camera-off">
        <EmptyState
          illustration={<DashedCardFrame symbol="questionmark.video" />}
          title="Camera not available"
          message="This device has no camera."
        />
      </View>
      <View className="bg-sheet">
        <EmptyState illustration={<GhostBatchRows />} title="No scans yet" message="Cards you scan wait here until you add them." />
      </View>
      <View className="bg-sheet">
        <EmptyState illustration={<EmptyBinderSlots rows={1} onSheet />} title="No copies found" message="Scan copies into your collection first." />
      </View>
    </Section>
  );
}

const nameAlertExamples = {
  new: { title: 'New deck', confirmLabel: 'Create', initialName: '' },
  rename: { title: 'Rename deck', confirmLabel: 'Save', initialName: 'Atraxa' },
};

function NameAlerts() {
  const [opened, setOpened] = useState<keyof typeof nameAlertExamples | null>(null);
  return (
    <Section title="Name alerts">
      <Button onPress={() => setOpened('new')}>
        <Text>Open the name alert</Text>
      </Button>
      <Button onPress={() => setOpened('rename')}>
        <Text>Open the name alert with a name</Text>
      </Button>
      {opened ? (
        <NameAlert
          {...nameAlertExamples[opened]}
          message="Name your deck."
          placeholder="Deck name"
          maxLength={deckNameLength}
          onConfirm={() => {}}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </Section>
  );
}

function CommanderCards() {
  return (
    <Section title="Commander cards">
      <CommanderGalleryCard name="Atraxa" chips={[{ label: 'Medium priority' }, { label: '0 cards' }]} commanders={[]} onPress={() => {}} />
      <CommanderGalleryCard name="Sol Ring" chips={[{ label: 'Medium priority' }, { label: '1 card' }]} commanders={[solRingCommander]} onPress={() => {}} />
      <CommanderGalleryCard
        name="Krenko"
        chips={[{ label: 'High priority' }, { label: '1 card' }]}
        commanders={[solRingCommander]}
        needsYouCount={2}
        onPress={() => {}}
      />
      <CommanderGalleryCard
        name="Partners"
        chips={[{ label: 'Low priority' }, { label: '2 cards' }]}
        commanders={[solRingCommander, { ...solRingCommander, copy_id: 'second-commander' }]}
        onPress={() => {}}
      />
      <CommanderGalleryCard
        name="Yuriko"
        chips={[
          { label: 'Medium priority' },
          { label: '87 cards' },
          { label: 'Invalid', tone: 'danger', symbol: 'nosign' },
          { label: 'Bracket 4', tone: 'info', accessibilityLabel: 'Estimated bracket 4' },
        ]}
        commanders={[]}
        onPress={() => {}}
      />
      <View className="-mx-lg">
        <DeckBanner name="Kinnan" chips={[{ label: 'High priority' }, { label: '1 card' }]} commanders={[]} />
      </View>
      <View className="-mx-lg">
        <DeckBanner
          name="Yuriko"
          chips={[{ label: 'Medium priority' }, { label: '87 cards' }]}
          chipButtons={[
            { label: 'Invalid', tone: 'danger', symbol: 'nosign', accessibilityLabel: 'Deck validity, Invalid', onPress: () => {} },
            { label: 'Bracket 4', tone: 'info', accessibilityLabel: 'Estimated bracket 4', onPress: () => {} },
          ]}
          commanders={[]}
        />
      </View>
      <View className="-mx-lg">
        <DeckBanner
          name="Partners"
          chips={[{ label: 'High priority' }, { label: '2 cards' }]}
          commanders={[solRingCommander, { ...solRingCommander, copy_id: 'second-commander' }]}
        />
      </View>
    </Section>
  );
}

function ChangeLines() {
  return (
    <Section title="Change lines">
      <ChangeLine direction="incoming" uri={solRing} name="Sol Ring" detail="Artifact" />
      <ChangeLine direction="outgoing" uri={solRing} name="Sol Ring" detail="Commander" />
      <ChangeLine direction="incoming" uri={solRing} name="Snow-Covered Island" detail="+2" />
      <Reason reason="Cheap removal that also answers an early threat." meta="ChatGPT · 16 October 2026 at 18:05" />
      <Reason reason="Cheap removal that also answers an early threat." meta={null} />
    </Section>
  );
}

function RuleRows() {
  return (
    <Section title="Rule rows">
      <RuleRow
        tone="danger"
        rule="Deck size"
        citation={{ label: 'CR 903.5a', onPress: () => {} }}
        message="87 of 100 cards."
        cards={[]}
        hint="Add 13 cards."
      />
      <RuleRow
        tone="danger"
        rule="Singleton"
        citation={{ label: 'CR 903.5b', onPress: () => {} }}
        message="2 copies of Sol Ring."
        cards={[{ key: 'sol-ring', name: 'Sol Ring', uri: solRing }]}
      />
      <RuleRow tone="warning" rule="Deck size" message="No rules data for Sol Ring." cards={[{ key: 'sol-ring', name: 'Sol Ring', uri: solRing }]} />
      <CardChip uri={solRing} name="Sol Ring" />
    </Section>
  );
}

function BracketSignalRows() {
  return (
    <Section title="Bracket signal rows">
      <BracketSignalRow
        title="Game Changers: 1"
        source="official"
        lowestBracket="Bracket 3"
        cards={[{ key: 'sol-ring', name: 'Sol Ring', uri: solRing }]}
        details={[]}
      />
      <BracketSignalRow
        title="Two-card combos: 1"
        source="heuristic"
        lowestBracket="Bracket 4"
        cards={[{ key: 'sol-ring', name: 'Sol Ring', uri: solRing }]}
        details={['Infinite colorless mana (Commander Spellbook, ruthless)']}
      />
    </Section>
  );
}

function WarningLines() {
  return (
    <Section title="Warning lines">
      <WarningLine message="Sol Ring is protected. Reverting unprotects it." />
      <WarningLine symbol="held" message="Sol Ring is held by the planned swap for Krenko. Reverting moves that swap to the buylist." />
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

function DeckTags() {
  return (
    <Section title="Deck tags">
      <DeckTag name="Atraxa" commanderArtUri={solRingArtCrop} onPress={() => {}} />
      <DeckTag name="Kinnan" commanderArtUri={null} onPress={() => {}} />
    </Section>
  );
}

function SheetSections() {
  return (
    <Section title="Sheet sections">
      <SheetSection title="Other options">
        <ListRow title="Lightning Bolt" detail="M10 146" leading={<CardThumbnail uri={solRing} />} />
      </SheetSection>
      <SheetSection title="Creatures" count={3}>
        <ListRow title="Birds of Paradise" detail="M12 165" leading={<CardThumbnail uri={solRing} />} />
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
        <CardSymbols />
        <Toggles />
        <Surfaces />
        <ListRows />
        <CardTiles />
        <CardHeroes />
        <ValueRows />
        <Switches />
        <CountBadges />
        <QuickActions />
        <Skeletons />
        <Glass />
        <FloatingMenuButtons />
        <PullIndicators />
        <Inputs />
        <ProgressBars />
        <SheetSections />
        <StepperRows />
        <NameAlerts />
        <CommanderCards />
        <DeckTags />
        <ChangeLines />
        <RuleRows />
        <BracketSignalRows />
        <WarningLines />
        <SwipeToConfirms />
        <EmptyStates />
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
