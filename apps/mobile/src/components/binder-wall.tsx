import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  useAnimatedValue,
  useWindowDimensions,
  View,
} from 'react-native';

import { colors, rounded, spacing, typography } from '@/theme';

type WallCard = {
  name: string;
  image: string;
  quantity?: number;
};

type WallColumn = {
  cards: WallCard[];
  durationMs: number;
  startProgress: number;
};

const scryfallImageUrl = (path: string) => `https://cards.scryfall.io/normal/front/${path}`;

const columns: WallColumn[] = [
  {
    durationMs: 70_000,
    startProgress: 0,
    cards: [
      {
        name: 'Sol Ring',
        image: scryfallImageUrl('8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446'),
        quantity: 2,
      },
      {
        name: 'Command Tower',
        image: scryfallImageUrl('1/a/1ac6cb62-45da-4e9a-84c6-09e6eacf0664.jpg?1789644465'),
      },
      {
        name: 'Arcane Signet',
        image: scryfallImageUrl('c/6/c6b6117c-faab-4bbb-b851-07bd8061ef03.jpg?1789644435'),
      },
      {
        name: 'Teysa Karlov',
        image: scryfallImageUrl('c/d/cd14f1ce-7fcd-485c-b7ca-01c5b45fdc01.jpg?1783915608'),
        quantity: 3,
      },
      {
        name: 'Prossh, Skyraider of Kher',
        image: scryfallImageUrl('8/8/889c1a0f-7df2-4497-8058-04358173d7e8.jpg?1783935112'),
      },
      {
        name: "Yuriko, the Tiger's Shadow",
        image: scryfallImageUrl('f/e/fe9be3e0-076c-4703-9750-2a6b0a178bc9.jpg?1783915606'),
      },
    ],
  },
  {
    durationMs: 90_000,
    startProgress: 30 / 90,
    cards: [
      {
        name: 'Rhystic Study',
        image: scryfallImageUrl('9/f/9f37c5b6-a59c-45cd-9a99-e9357fe9ea1b.jpg?1783919146'),
      },
      {
        name: 'Cyclonic Rift',
        image: scryfallImageUrl('d/f/dfb7c4b9-f2f4-4d4e-baf2-86551c8150fe.jpg?1783913339'),
      },
      {
        name: 'Meren of Clan Nel Toth',
        image: scryfallImageUrl('5/0/508b1442-bf2c-4ad6-9bcf-bd894e081ab6.jpg?1783907026'),
        quantity: 2,
      },
      {
        name: 'Smothering Tithe',
        image: scryfallImageUrl('8/6/861b5889-0183-4bee-afeb-a4b2aa700a8e.jpg?1783915712'),
      },
      {
        name: 'Omnath, Locus of Creation',
        image: scryfallImageUrl('4/e/4e4fb50c-a81f-44d3-93c5-fa9a0b37f617.jpg?1783929320'),
      },
      {
        name: 'The Ur-Dragon',
        image: scryfallImageUrl('1/0/10d42b35-844f-4a64-9981-c6118d45e826.jpg?1783915607'),
        quantity: 3,
      },
    ],
  },
  {
    durationMs: 80_000,
    startProgress: 55 / 80,
    cards: [
      {
        name: 'Korvold, Fae-Cursed King',
        image: scryfallImageUrl('6/0/607c1793-8e5a-4ebf-87c6-7f9c99bbd29a.jpg?1783906027'),
      },
      {
        name: 'Krenko, Mob Boss',
        image: scryfallImageUrl('8/2/824b2d73-2151-4e5e-9f05-8f63e2bdcaa9.jpg?1783909065'),
        quantity: 3,
      },
      {
        name: 'Lightning Greaves',
        image: scryfallImageUrl('b/6/b61634ae-05be-4b56-8ebb-9d4ade902e42.jpg?1783903217'),
      },
      {
        name: 'Kenrith, the Returned King',
        image: scryfallImageUrl('5/6/56c1227e-bea7-47cb-bbec-389a3d585af5.jpg?1783932556'),
      },
      {
        name: 'Edgar Markov',
        image: scryfallImageUrl('a/5/a577ba08-0aa8-45be-aa83-d5078770127c.jpg?1783908078'),
        quantity: 2,
      },
      {
        name: "Atraxa, Praetors' Voice",
        image: scryfallImageUrl('d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1783930136'),
      },
    ],
  },
];

const cardHeightPerWidth = 680 / 488;
const wallOverhang = 10;
const wallPadding = spacing.md;
const columnGap = spacing.sm;
const tileGap = 10;

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState<boolean>();

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

type DriftColumnProps = WallColumn & {
  tileHeight: number;
  drifting: boolean;
};

function DriftColumn({ cards, tileHeight, durationMs, startProgress, drifting }: DriftColumnProps) {
  const progress = useAnimatedValue(0);
  const loopDistance = cards.length * (tileHeight + tileGap);
  const translateY = useMemo(
    () =>
      Animated.modulo(Animated.add(progress, startProgress), 1).interpolate({
        inputRange: [0, 1],
        outputRange: [0, -loopDistance],
      }),
    [progress, startProgress, loopDistance],
  );

  useEffect(() => {
    if (!drifting) {
      return;
    }
    progress.setValue(0);
    const drift = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    drift.start();
    return () => drift.stop();
  }, [drifting, durationMs, progress]);

  return (
    <View style={styles.column}>
      <Animated.View style={[styles.columnTiles, { transform: [{ translateY }] }]}>
        {[...cards, ...cards].map((card, index) => (
          <View key={`${card.name}-${index}`} style={[styles.tile, { height: tileHeight }]}>
            <Image
              source={card.image}
              cachePolicy="disk"
              transition={200}
              style={StyleSheet.absoluteFill}
            />
            {card.quantity && <Text style={styles.quantity}>{card.quantity}</Text>}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

export function BinderWall() {
  const { width } = useWindowDimensions();
  const drifting = useReduceMotion() === false;
  const columnWidth =
    (width + 2 * wallOverhang - 2 * wallPadding - (columns.length - 1) * columnGap) /
    columns.length;
  const tileHeight = columnWidth * cardHeightPerWidth;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.wall}>
      {columns.map((column) => (
        <DriftColumn
          key={column.cards[0].name}
          {...column}
          tileHeight={tileHeight}
          drifting={drifting}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wall: {
    position: 'absolute',
    top: -20,
    left: -wallOverhang,
    right: -wallOverhang,
    bottom: 0,
    flexDirection: 'row',
    gap: columnGap,
    paddingHorizontal: wallPadding,
    opacity: 0.5,
    transform: [{ rotate: '-6deg' }, { scale: 1.12 }],
  },
  column: {
    flex: 1,
  },
  columnTiles: {
    gap: tileGap,
  },
  tile: {
    borderRadius: rounded.sm,
    overflow: 'hidden',
    backgroundColor: colors.line,
  },
  quantity: {
    position: 'absolute',
    top: 5,
    left: 5,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    borderRadius: rounded.full,
    overflow: 'hidden',
    backgroundColor: colors.quantityBadge,
    color: colors.text,
    ...typography.tabLabel,
    lineHeight: 19,
    textAlign: 'center',
  },
});
