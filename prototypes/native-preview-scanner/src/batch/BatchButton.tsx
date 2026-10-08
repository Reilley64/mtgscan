import { Pressable, StyleSheet, Text, View } from "react-native";

export function BatchButton({
  count,
  onPress,
  onLongPress,
}: {
  count: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Review batch, ${count} cards`}
      style={styles.button}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={[styles.card, styles.back]} />
      <View style={[styles.card, styles.front]} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "rgba(8, 11, 13, 0.85)",
  },
  card: {
    position: "absolute",
    width: 16,
    height: 22,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: "white",
  },
  back: {
    transform: [{ translateX: 4 }, { translateY: -3 }, { rotate: "12deg" }],
  },
  front: {
    backgroundColor: "#11171a",
    transform: [{ translateX: -3 }, { translateY: 2 }, { rotate: "-6deg" }],
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#ff4f6d",
  },
  badgeText: { color: "white", fontSize: 11, fontWeight: "900" },
});
