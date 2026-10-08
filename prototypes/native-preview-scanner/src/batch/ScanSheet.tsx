import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CONDITIONS,
  FINISHES,
  LANGUAGES,
  type BatchAction,
  type BatchScan,
  type Printing,
} from "./batch";
import { autocompleteNames, cardImageUrl, paperPrintings } from "./scryfall";

const AUTOCOMPLETE_DELAY_MS = 250;

export function ScanSheet({
  scan,
  dispatch,
  onClose,
}: {
  scan: BatchScan;
  dispatch: (action: BatchAction) => void;
  onClose: () => void;
}) {
  const [searching, setSearching] = useState(scan.printing === null);
  const choose = (printing: Printing, source: "scan" | "search") => {
    dispatch({ type: "choose", scanId: scan.scanId, printing, source });
    setSearching(false);
  };
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {searching ? (
          <SearchPanel
            onPick={(printing) => choose(printing, "search")}
            onCancel={() =>
              scan.printing === null ? onClose() : setSearching(false)
            }
          />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {scan.printing ? (
              <View style={styles.current}>
                <Image
                  source={{
                    uri: cardImageUrl(scan.printing.scryfallId, "normal"),
                  }}
                  style={styles.large}
                />
                <View style={styles.currentText}>
                  <Text style={styles.title}>{scan.printing.name}</Text>
                  <Text style={styles.subtitle}>
                    {scan.printing.set.toUpperCase()} #
                    {scan.printing.collectorNumber}
                  </Text>
                </View>
              </View>
            ) : null}

            <Choice
              label="Finish"
              values={FINISHES}
              value={scan.finish}
              onChange={(finish) =>
                dispatch({ type: "setFinish", scanId: scan.scanId, finish })
              }
            />
            <Choice
              label="Condition"
              values={CONDITIONS}
              value={scan.condition}
              onChange={(condition) =>
                dispatch({
                  type: "setCondition",
                  scanId: scan.scanId,
                  condition,
                })
              }
            />
            <Choice
              label="Language"
              values={LANGUAGES}
              value={scan.language}
              onChange={(language) =>
                dispatch({
                  type: "setLanguage",
                  scanId: scan.scanId,
                  language,
                })
              }
            />

            {scan.options.filter(
              (option) => option.scryfallId !== scan.printing?.scryfallId,
            ).length > 0 ? (
              <Text style={styles.section}>Other options</Text>
            ) : null}
            {scan.options
              .filter(
                (option) => option.scryfallId !== scan.printing?.scryfallId,
              )
              .map((option) => (
                <PrintingRow
                  key={option.scryfallId}
                  printing={option}
                  onPress={() => choose(option, "scan")}
                />
              ))}

            <Pressable
              style={styles.secondary}
              onPress={() => setSearching(true)}
            >
              <Text style={styles.secondaryText}>None of these: search</Text>
            </Pressable>
            <View style={styles.row}>
              <Pressable
                style={[styles.secondary, styles.danger]}
                onPress={() => {
                  dispatch({ type: "remove", scanId: scan.scanId });
                  onClose();
                }}
              >
                <Text style={styles.dangerText}>Remove scan</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={onClose}>
                <Text style={styles.primaryText}>Done</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function SearchPanel({
  onPick,
  onCancel,
}: {
  onPick: (printing: Printing) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [printings, setPrintings] = useState<Printing[] | null>(null);
  useEffect(() => {
    if (name !== null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      autocompleteNames(query)
        .then((result) => {
          if (!cancelled) setNames(result);
        })
        .catch(() => undefined);
    }, AUTOCOMPLETE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, name]);
  useEffect(() => {
    if (name === null) return;
    let cancelled = false;
    setPrintings(null);
    paperPrintings(name)
      .then((result) => {
        if (!cancelled) setPrintings(result);
      })
      .catch(() => setPrintings([]));
    return () => {
      cancelled = true;
    };
  }, [name]);
  return (
    <View style={styles.search}>
      <View style={styles.row}>
        <TextInput
          autoFocus
          autoCorrect={false}
          placeholder="Card name"
          placeholderTextColor="#6f7b80"
          style={styles.input}
          value={name ?? query}
          onChangeText={(text) => {
            setName(null);
            setQuery(text);
          }}
        />
        <Pressable style={styles.secondarySmall} onPress={onCancel}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      </View>
      {name === null ? (
        <FlatList
          data={names}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <Pressable style={styles.suggestion} onPress={() => setName(item)}>
              <Text style={styles.suggestionText}>{item}</Text>
            </Pressable>
          )}
        />
      ) : printings === null ? (
        <ActivityIndicator color="#d8ff62" style={styles.loading} />
      ) : (
        <FlatList
          data={printings}
          keyExtractor={(item) => item.scryfallId}
          renderItem={({ item }) => (
            <PrintingRow printing={item} onPress={() => onPick(item)} />
          )}
        />
      )}
    </View>
  );
}

function PrintingRow({
  printing,
  onPress,
}: {
  printing: Printing;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <Image
        source={{ uri: cardImageUrl(printing.scryfallId) }}
        style={styles.optionThumb}
      />
      <View style={styles.optionText}>
        <Text style={styles.optionName} numberOfLines={1}>
          {printing.name}
        </Text>
        <Text style={styles.subtitle}>
          {printing.set.toUpperCase()} #{printing.collectorNumber}
        </Text>
      </View>
    </Pressable>
  );
}

function Choice<T extends string>({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choice}>
      <Text style={styles.section}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {values.map((option) => (
            <Pressable
              key={option}
              style={[styles.pill, option === value && styles.pillSelected]}
              onPress={() => onChange(option)}
            >
              <Text
                style={[
                  styles.pillText,
                  option === value && styles.pillTextSelected,
                ]}
              >
                {option.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: "#11171a" },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    marginTop: 8,
    borderRadius: 3,
    backgroundColor: "#3a454b",
  },
  content: { padding: 16, gap: 12 },
  current: { flexDirection: "row", gap: 12 },
  large: { width: 140, height: 195, borderRadius: 7 },
  currentText: { flex: 1, gap: 4 },
  title: { color: "white", fontSize: 18, fontWeight: "800" },
  subtitle: { color: "#b5c0c5", fontSize: 12 },
  section: { color: "#d8ff62", fontSize: 12, fontWeight: "800" },
  choice: { gap: 6 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: "#232c31",
  },
  pillSelected: { backgroundColor: "#d8ff62" },
  pillText: { color: "white", fontSize: 12, fontWeight: "700" },
  pillTextSelected: { color: "#101500" },
  option: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#192126",
  },
  optionThumb: { width: 46, height: 64, borderRadius: 4 },
  optionText: { flex: 1, gap: 2 },
  optionName: { color: "white", fontSize: 14, fontWeight: "700" },
  primary: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#d8ff62",
  },
  primaryText: { color: "#101500", fontSize: 14, fontWeight: "900" },
  secondary: {
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#232c31",
  },
  secondarySmall: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#232c31",
  },
  secondaryText: { color: "white", fontSize: 14, fontWeight: "700" },
  danger: { flex: 1, backgroundColor: "#3a1d1d" },
  dangerText: { color: "#ff8e8e", fontSize: 14, fontWeight: "700" },
  search: { flex: 1, padding: 16, gap: 10 },
  input: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    color: "white",
    fontSize: 16,
    backgroundColor: "#192126",
  },
  suggestion: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#232c31",
  },
  suggestionText: { color: "white", fontSize: 15 },
  loading: { marginTop: 24 },
});
