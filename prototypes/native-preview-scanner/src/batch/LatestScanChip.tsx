import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BatchScan } from "./batch";
import { cardImageUrl } from "./scryfall";

export function LatestScanChip({
  scan,
  loading,
  onOpen,
}: {
  scan: BatchScan | null;
  loading: boolean;
  onOpen: (scanId: string) => void;
}) {
  if (loading) return <SkeletonChip />;
  if (scan === null) return null;
  return (
    <Pressable style={styles.chip} onPress={() => onOpen(scan.scanId)}>
      {scan.printing ? (
        <Image
          source={{ uri: cardImageUrl(scan.printing.scryfallId) }}
          style={styles.thumb}
        />
      ) : (
        <View style={[styles.thumb, styles.placeholder]}>
          <Text style={styles.unknownText}>?</Text>
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {scan.printing?.name ?? "Not recognized"}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {scan.printing
            ? `${scan.printing.set.toUpperCase()} #${scan.printing.collectorNumber}`
            : "Tap to search"}
          {scan.finish !== "nonfoil" ? ` · ${scan.finish}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const PULSE_MS = 650;

function SkeletonChip() {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: PULSE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: PULSE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);
  return (
    <View accessibilityLabel="Recognizing card" style={styles.chip}>
      <Animated.View style={[styles.thumb, styles.bone, { opacity }]} />
      <View style={styles.text}>
        <Animated.View style={[styles.lineLong, styles.bone, { opacity }]} />
        <Animated.View style={[styles.lineShort, styles.bone, { opacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bone: { backgroundColor: "#2f393f" },
  lineLong: { width: 140, height: 14, borderRadius: 4 },
  lineShort: { width: 80, height: 10, marginTop: 6, borderRadius: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "center",
    minWidth: 220,
    maxWidth: "92%",
    padding: 8,
    paddingRight: 16,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: "rgba(8, 11, 13, 0.9)",
  },
  thumb: { width: 46, height: 64, borderRadius: 4 },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2a3238",
  },
  unknownText: { color: "#f4d06f", fontSize: 22, fontWeight: "900" },
  text: { flexShrink: 1, gap: 2 },
  name: { color: "white", fontSize: 15, fontWeight: "800" },
  detail: { color: "#b5c0c5", fontSize: 12 },
});
