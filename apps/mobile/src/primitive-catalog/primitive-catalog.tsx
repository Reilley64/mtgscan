import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Image, ScrollView, View } from 'react-native';

import { AppleSignInButton } from '@/components/atoms/apple-sign-in-button';
import { Button } from '@/components/atoms/button';
import { CardThumbnail } from '@/components/atoms/card-thumbnail';
import { Chip } from '@/components/atoms/chip';
import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';
import { TextLink } from '@/components/atoms/text-link';
import { Toggle } from '@/components/atoms/toggle';
import { AccountCard } from '@/components/molecules/account-card';
import { Brand } from '@/components/molecules/brand';
import { CardGrid } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { ChipGroup } from '@/components/molecules/chip-group';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { GalleryCard } from '@/components/molecules/gallery-card';
import { ListRow } from '@/components/molecules/list-row';
import { SwitchRow } from '@/components/molecules/switch-row';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { colors } from '@/theme';

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
      <AppleSignInButton busy disabled onPress={() => {}} />
      <Button variant="google" size="sign-in" onPress={() => {}}>
        <Image source={require('../../assets/google-logo.png')} className="h-google-logo w-google-logo" />
        <Text>Continue with Google</Text>
      </Button>
      <Button variant="google" size="sign-in" busy onPress={() => {}}>
        <Text>Google busy</Text>
      </Button>
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
      <FailureNotice message="Sign-in did not work." />
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
        <CardTile uri={solRing} caption="CMM 464" quantity={2} accessibilityLabel="Sol Ring, CMM 464, 2 owned" />
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
        <Section title="Drawer sheet">
          <Button onPress={() => router.push('/primitives-sheet')}>
            <Text>Open the drawer sheet</Text>
          </Button>
        </Section>
      </ScrollView>
    </View>
  );
}
