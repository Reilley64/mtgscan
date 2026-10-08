import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CONDITIONS,
  LANGUAGES,
  mergeStacks,
  type BatchAction,
  type BatchState,
} from "./batch";
import { cardImageUrl } from "./scryfall";

export function BatchReview({
  state,
  dispatch,
  onClose,
}: {
  state: BatchState;
  dispatch: (action: BatchAction) => void;
  onClose: () => void;
}) {
  const stacks = mergeStacks([], state.scans);
  const unresolved = state.scans.filter(
    (scan) => scan.printing === null,
  ).length;
  const cards = stacks.reduce((sum, stack) => sum + stack.quantity, 0);
  const owned = state.collection.reduce(
    (sum, stack) => sum + stack.quantity,
    0,
  );
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Text style={styles.title}>Review batch</Text>
        <Text style={styles.subtitle}>
          {cards} cards in {stacks.length} stacks
          {unresolved > 0 ? `, ${unresolved} not recognized` : ""}. Collection:{" "}
          {owned} cards.
        </Text>
        <View style={styles.defaults}>
          <Text style={styles.section}>Defaults for new scans</Text>
          <View style={styles.row}>
            {CONDITIONS.map((condition) => (
              <Pressable
                key={condition}
                style={[
                  styles.pill,
                  condition === state.defaults.condition && styles.pillSelected,
                ]}
                onPress={() =>
                  dispatch({ type: "setDefaults", defaults: { condition } })
                }
              >
                <Text
                  style={[
                    styles.pillText,
                    condition === state.defaults.condition &&
                      styles.pillTextSelected,
                  ]}
                >
                  {condition}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            {LANGUAGES.slice(0, 6).map((language) => (
              <Pressable
                key={language}
                style={[
                  styles.pill,
                  language === state.defaults.language && styles.pillSelected,
                ]}
                onPress={() =>
                  dispatch({ type: "setDefaults", defaults: { language } })
                }
              >
                <Text
                  style={[
                    styles.pillText,
                    language === state.defaults.language &&
                      styles.pillTextSelected,
                  ]}
                >
                  {language.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <FlatList
          data={stacks}
          keyExtractor={(stack) =>
            `${stack.printing.scryfallId}|${stack.finish}|${stack.condition}|${stack.language}`
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.stack}>
              <Image
                source={{ uri: cardImageUrl(item.printing.scryfallId) }}
                style={styles.thumb}
              />
              <View style={styles.stackText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.printing.name}
                </Text>
                <Text style={styles.subtitle}>
                  {item.printing.set.toUpperCase()} #
                  {item.printing.collectorNumber} · {item.finish} ·{" "}
                  {item.condition} · {item.language.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.quantity}>×{item.quantity}</Text>
            </View>
          )}
        />
        <View style={styles.row}>
          <Pressable style={styles.secondary} onPress={onClose}>
            <Text style={styles.secondaryText}>Keep scanning</Text>
          </Pressable>
          <Pressable
            disabled={cards === 0}
            style={[styles.primary, cards === 0 && styles.disabled]}
            onPress={() => {
              console.log(
                "NATIVE_PREVIEW_EVENT " +
                  JSON.stringify({
                    event: "batch-committed",
                    atMs: Date.now(),
                    cards,
                    stacks: stacks.map((stack) => ({
                      scryfallId: stack.printing.scryfallId,
                      finish: stack.finish,
                      condition: stack.condition,
                      language: stack.language,
                      quantity: stack.quantity,
                    })),
                  }),
              );
              dispatch({ type: "commit" });
              onClose();
            }}
          >
            <Text style={styles.primaryText}>Add {cards} to collection</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 30,
    gap: 10,
    backgroundColor: "#080b0d",
  },
  title: { color: "white", fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#b5c0c5", fontSize: 12 },
  section: { color: "#d8ff62", fontSize: 12, fontWeight: "800" },
  defaults: { gap: 6 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#232c31",
  },
  pillSelected: { backgroundColor: "#d8ff62" },
  pillText: { color: "white", fontSize: 11, fontWeight: "700" },
  pillTextSelected: { color: "#101500" },
  list: { gap: 8 },
  stack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#11171a",
  },
  thumb: { width: 46, height: 64, borderRadius: 4 },
  stackText: { flex: 1, gap: 2 },
  name: { color: "white", fontSize: 14, fontWeight: "700" },
  quantity: { color: "#d8ff62", fontSize: 18, fontWeight: "900" },
  primary: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#d8ff62",
  },
  primaryText: { color: "#101500", fontSize: 14, fontWeight: "900" },
  secondary: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 8,
    backgroundColor: "#232c31",
  },
  secondaryText: { color: "white", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
