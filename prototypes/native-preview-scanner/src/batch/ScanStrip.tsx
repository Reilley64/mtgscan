import { useRef } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BatchScan } from "./batch";
import { cardImageUrl } from "./scryfall";

export function ScanStrip({
  scans,
  pendingCount,
  onOpen,
}: {
  scans: readonly BatchScan[];
  pendingCount: number;
  onOpen: (scanId: string) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      onContentSizeChange={() =>
        scroll.current?.scrollToEnd({ animated: true })
      }
    >
      {scans.map((scan) => (
        <Pressable
          key={scan.scanId}
          style={styles.chip}
          onPress={() => onOpen(scan.scanId)}
        >
          {scan.printing ? (
            <Image
              source={{ uri: cardImageUrl(scan.printing.scryfallId) }}
              style={styles.thumb}
            />
          ) : (
            <View style={[styles.thumb, styles.unknown]}>
              <Text style={styles.unknownText}>?</Text>
            </View>
          )}
          <Text style={styles.name} numberOfLines={1}>
            {scan.printing?.name ?? "Not recognized"}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {scan.printing
              ? `${scan.printing.set.toUpperCase()} ${scan.printing.collectorNumber}`
              : "Tap to search"}
            {scan.finish !== "nonfoil" ? ` · ${scan.finish}` : ""}
          </Text>
        </Pressable>
      ))}
      {Array.from({ length: pendingCount }, (_, index) => (
        <View key={`pending-${index}`} style={[styles.chip, styles.pending]}>
          <ActivityIndicator color="#d8ff62" />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 8, paddingHorizontal: 4, paddingVertical: 6 },
  chip: {
    width: 92,
    padding: 6,
    gap: 3,
    borderRadius: 10,
    backgroundColor: "rgba(8, 11, 13, 0.9)",
  },
  pending: { height: 150, alignItems: "center", justifyContent: "center" },
  thumb: { width: 80, height: 112, borderRadius: 5 },
  unknown: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2a3238",
  },
  unknownText: { color: "#f4d06f", fontSize: 28, fontWeight: "900" },
  name: { color: "white", fontSize: 11, fontWeight: "700" },
  detail: { color: "#b5c0c5", fontSize: 10 },
});
