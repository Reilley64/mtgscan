import {
  ActivityIndicator,
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
  pending,
  onOpen,
}: {
  scan: BatchScan | null;
  pending: boolean;
  onOpen: (scanId: string) => void;
}) {
  if (pending)
    return (
      <View style={styles.chip}>
        <View style={[styles.thumb, styles.placeholder]}>
          <ActivityIndicator color="#d8ff62" />
        </View>
        <Text style={styles.name}>Recognizing...</Text>
      </View>
    );
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

const styles = StyleSheet.create({
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
