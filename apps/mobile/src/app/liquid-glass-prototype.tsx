import { useReducer, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassVariantContext, type GlassVariant } from '@/components/atoms/liquid-glass-prototype';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { GlassVariantSwitcher } from '@/components/organisms/glass-variant-switcher';
import { LatestScanOverlay } from '@/scan/scan-camera';
import { emptyScanBatch, scanBatchReducer, type Printing } from '@/scan/scan-batch';
import { spacing } from '@/theme';

const scenes = {
  Table: {
    image: require('../../assets/liquid-glass-prototype/table.jpg'),
    printing: {
      printingId: '650fa2f4-2916-427c-a0f9-37e2dbe8e1fc',
      oracleId: 'rivendell',
      name: 'Rivendell',
      setCode: 'ltr',
      collectorNumber: '344',
      finishes: ['nonfoil', 'foil'],
      basicLand: false,
    },
  },
  Bright: {
    image: require('../../assets/liquid-glass-prototype/bright-card.jpg'),
    printing: {
      printingId: 'bb38dcd5-4f12-461c-96a8-867a5b63c5c1',
      oracleId: 'white-ward',
      name: 'White Ward',
      setCode: '3ed',
      collectorNumber: '45',
      finishes: ['nonfoil'],
      basicLand: false,
    },
  },
  Busy: {
    image: require('../../assets/liquid-glass-prototype/busy-art.jpg'),
    printing: {
      printingId: '6e70332c-de0b-45ce-bbd1-5de4314c08db',
      oracleId: 'time-warp',
      name: 'Time Warp',
      setCode: 'sta',
      collectorNumber: '22',
      finishes: ['nonfoil', 'foil', 'etched'],
      basicLand: false,
    },
  },
} satisfies Record<string, { image: number; printing: Printing }>;

type Scene = keyof typeof scenes;

const sceneKeys = Object.keys(scenes) as Scene[];

function seededBatch() {
  return sceneKeys.reduce(
    (batch, scene) =>
      scanBatchReducer(batch, {
        type: 'recognized',
        scanId: scene,
        candidates: [scenes[scene].printing],
        sameTextTwinCount: 0,
        premiumMark: false,
      }),
    emptyScanBatch,
  );
}

export default function LiquidGlassPrototypeScreen() {
  const [variant, setVariant] = useState<GlassVariant>('C');
  const [scene, setScene] = useState<Scene>('Table');
  const [batch, dispatch] = useReducer(scanBatchReducer, undefined, seededBatch);
  const { top } = useSafeAreaInsets();
  const scan = batch.scans.find((candidate) => candidate.scanId === scene);
  return (
    <GlassVariantContext value={variant}>
      <View className="flex-1 bg-camera-off">
        <Image source={scenes[scene].image} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <View className="absolute inset-x-lg gap-sm" style={{ top: top + spacing.sm }}>
          <GlassVariantSwitcher variant={variant} onSelect={setVariant} />
          <View className="w-[240px] self-center">
            <ToggleGroup values={sceneKeys} selected={scene} labelOf={(key) => key} onSelect={setScene} />
          </View>
        </View>
        <LatestScanOverlay latest={scan ? { kind: 'scan', scan } : null} dispatch={dispatch} />
      </View>
    </GlassVariantContext>
  );
}
