import type { Deck } from "@mtgscan/supabase/decks";
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from "expo-router/testing-library";
import { StyleSheet } from "react-native";

import {
  deckWritesSent,
  decksOnTheServer,
  deleteDeckOnTheServer,
  failDeckReads,
  failDeckWrites,
  holdDeckListReads,
  holdDeckReads,
  ownDecks,
  startSignedIn,
} from "./fake-supabase";
import {
  appearsBefore,
  dashedOutlinesColored,
  headerButton,
  heightsAround,
  minHeightsAround,
  headerMenu,
  headerMenuRows,
  leftHeaderButtons,
  pressAlertButton,
  pressAlertWithFieldButton,
  pressHeaderMenuAction,
  pressHeaderButton,
  presentedAlert,
  presentedAlertWithField,
  pressTab,
  placeInScrollView,
  pushedScreen,
  pushedScreenTitle,
  selectedTab,
  swipeBackFromThePushedScreen,
  tabHeader,
  typeInAlertField,
  scrollPushedScreenTo,
} from "./native-ui";
import { renderApp } from "./render-app";
import { tokenColors } from "./token-colors";

const { line, primary, surface } = tokenColors;

beforeEach(() => {
  startSignedIn();
});

async function openDecks() {
  await renderApp();
  await pressTab("Decks");
  return within(selectedTab());
}

async function openNameAlert() {
  await pressHeaderButton(selectedTab(), "Create deck");
}

function createdDeckNames() {
  return deckWritesSent().flatMap(({ name, request }) =>
    name === "create_deck" ? [(request as { name: string }).name] : [],
  );
}

function decksMarkedUsed() {
  return deckWritesSent().flatMap(({ name, request }) =>
    name === "mark_deck_used" ? [(request as { deck_id: string }).deck_id] : [],
  );
}

function galleryCardNames() {
  return within(selectedTab())
    .getAllByRole("header")
    .map((title) => title.props.children as string);
}

const medium = { priority: "medium", card_count: 0 } as const;

describe("creating a deck", () => {
  test("Decks has a Create deck bar button with a plus before the settings button", async () => {
    await openDecks();

    expect(tabHeader(selectedTab()).buttons).toEqual([
      "Create deck",
      "Settings",
    ]);
    expect(headerButton(selectedTab(), "Create deck")).toMatchObject({
      type: "button",
      symbol: "plus",
    });
  });

  test("the Create deck bar button opens the native alert New deck with a name field, Cancel, and Create", async () => {
    await openDecks();

    await openNameAlert();

    expect(presentedAlertWithField()).toEqual({
      title: "New deck",
      message: "Name your deck.",
      field: { placeholder: "Deck name", maxLength: 64, text: "" },
      buttons: [
        { label: "Cancel", enabled: true },
        { label: "Create", enabled: false },
      ],
    });
  });

  test("Create is off while the trimmed name is empty", async () => {
    await openDecks();
    await openNameAlert();

    await typeInAlertField("   ");
    expect(presentedAlertWithField()?.buttons).toContainEqual({
      label: "Create",
      enabled: false,
    });

    await typeInAlertField(" Atraxa");
    expect(presentedAlertWithField()?.buttons).toContainEqual({
      label: "Create",
      enabled: true,
    });
  });

  test("Create creates the deck with the trimmed name and opens it on Cards", async () => {
    await openDecks();
    await openNameAlert();
    await typeInAlertField("  Atraxa ");

    await pressAlertWithFieldButton("Create");

    expect(createdDeckNames()).toEqual(["Atraxa"]);
    expect(presentedAlertWithField()).toBeNull();
    const deck = within(pushedScreen());
    expect(
      await deck.findByRole("header", { name: "Atraxa" }),
    ).toBeOnTheScreen();
    expect(
      deck.getByRole("radio", { name: "Cards", checked: true }),
    ).toBeOnTheScreen();
    expect(deck.getByText("No cards yet")).toBeOnTheScreen();
  });

  test("Cancel creates nothing", async () => {
    await openDecks();
    await openNameAlert();
    await typeInAlertField("Atraxa");

    await pressAlertWithFieldButton("Cancel");

    expect(presentedAlertWithField()).toBeNull();
    expect(createdDeckNames()).toEqual([]);
    expect(decksOnTheServer()).toEqual([]);
    expect(within(selectedTab()).getByText("No decks yet")).toBeOnTheScreen();
  });

  test("a deck that could not be created shows an alert and opens nothing", async () => {
    failDeckWrites(1);
    await openDecks();
    await openNameAlert();
    await typeInAlertField("Atraxa");

    await pressAlertWithFieldButton("Create");

    expect(presentedAlert()).toEqual({
      title: "Could not create this deck",
      message: "Check your connection.",
      buttons: ["OK"],
    });
    expect(() => pushedScreen()).toThrow("No screen is pushed");
  });

  test("the alert opens again with an empty name field", async () => {
    await openDecks();
    await openNameAlert();
    await typeInAlertField("Atraxa");
    await pressAlertWithFieldButton("Cancel");

    await openNameAlert();

    expect(presentedAlertWithField()?.buttons).toContainEqual({
      label: "Create",
      enabled: false,
    });
  });
});

describe("the Decks empty state", () => {
  test("with no decks, Decks says so, and Create deck opens the same alert", async () => {
    const decks = await openDecks();

    expect(
      decks.getByLabelText(
        "No decks yet, Create a deck, then add cards to it from your collection.",
      ),
    ).toBeOnTheScreen();

    await fireEvent.press(decks.getByRole("button", { name: "Create deck" }));

    expect(presentedAlertWithField()?.title).toBe("New deck");
  });

  test("a deck list that could not load says so, and Try again reads it again", async () => {
    failDeckReads(1);
    ownDecks([{ name: "Atraxa", ...medium }]);
    const decks = await openDecks();

    expect(decks.getByText("Could not load your decks")).toBeOnTheScreen();

    await fireEvent.press(decks.getByRole("button", { name: "Try again" }));

    expect(
      await decks.findByRole("button", { name: "Atraxa" }),
    ).toBeOnTheScreen();
  });
});

describe("the commander gallery", () => {
  test("until the deck list read returns, Decks shows the gallery card skeletons, then the gallery cards", async () => {
    ownDecks([{ name: "Atraxa", ...medium }]);
    const reads = holdDeckListReads();

    const decks = await openDecks();
    expect(
      decks.getByRole("progressbar", { name: "Loading decks" }),
    ).toBeOnTheScreen();
    expect(decks.queryByText("No decks yet")).not.toBeOnTheScreen();

    await reads.finish();

    expect(
      await decks.findByRole("button", { name: "Atraxa" }),
    ).toBeOnTheScreen();
    expect(
      decks.queryByRole("progressbar", { name: "Loading decks" }),
    ).not.toBeOnTheScreen();
  });

  test("shows one card per deck, the deck used most recently first", async () => {
    ownDecks([
      { name: "Atraxa", ...medium },
      { name: "Kinnan", priority: "high", card_count: 1 },
      { name: "Yuriko", priority: "low", card_count: 0 },
    ]);
    const decks = await openDecks();

    expect(
      decks
        .getAllByRole("button", { name: /^(Yuriko|Kinnan|Atraxa)(,|$)/ })
        .map((card) => card.props.accessibilityLabel),
    ).toEqual(["Yuriko", "Kinnan, Invalid, Estimated bracket 2", "Atraxa"]);
  });

  test("a gallery card is a 140 px ghost commander card with the name in card title type, and no priority or card count chips", async () => {
    ownDecks([{ name: "Atraxa", ...medium }]);
    const decks = await openDecks();

    const card = decks.getByRole("button", { name: "Atraxa" });
    expect(within(card).getByRole("header", { name: "Atraxa" })).toHaveStyle({
      fontSize: 20,
      fontWeight: "800",
    });
    expect(within(card).queryByText("Medium priority")).not.toBeOnTheScreen();
    expect(within(card).queryByText("0 cards")).not.toBeOnTheScreen();
    expect(
      within(card).getByRole("header", { name: "Atraxa" }).parent,
    ).toHaveStyle({ minHeight: 140 });
    expect(dashedOutlinesColored(card, line)).toBe(1);
  });

  test("tapping a gallery card opens that deck, which then comes first in the gallery", async () => {
    ownDecks([
      { name: "Atraxa", ...medium },
      { name: "Kinnan", ...medium },
    ]);
    const decks = await openDecks();
    expect(galleryCardNames()).toEqual(["Kinnan", "Atraxa"]);

    await fireEvent.press(decks.getByRole("button", { name: "Atraxa" }));

    expect(
      await within(pushedScreen()).findByRole("header", { name: "Atraxa" }),
    ).toBeOnTheScreen();
    expect(decksMarkedUsed()).toEqual(["deck-1"]);

    await swipeBackFromThePushedScreen();

    expect(
      await decks.findByRole("button", { name: "Atraxa" }),
    ).toBeOnTheScreen();
    expect(galleryCardNames()).toEqual(["Atraxa", "Kinnan"]);
  });
});

describe("the deck screen", () => {
  async function openDeck(name = "Atraxa") {
    const decks = await openDecks();
    await fireEvent.press(
      decks.getByRole("button", { name: new RegExp(`^${name}(,|$)`) }),
    );
    const deck = within(pushedScreen());
    await deck.findByRole("header", { name });
    return deck;
  }

  test("is pushed over the tab bar with a full-width ghost commander banner from the top edge, and the name with no priority or card count chips", async () => {
    ownDecks([{ name: "Atraxa", priority: "high", card_count: 0 }]);

    const deck = await openDeck();

    const title = deck.getByRole("header", { name: "Atraxa" });
    expect(title).toHaveStyle({ fontSize: 20, fontWeight: "800" });
    const { block: banner, isFirst, contentInsets } = placeInScrollView(title);
    expect(isFirst).toBe(true);
    expect(contentInsets).toEqual({ top: 0, left: 0, right: 0 });
    expect(banner).toHaveStyle({
      width: "100%",
      backgroundColor: surface,
      borderStyle: "dashed",
      borderColor: line,
    });
    expect(StyleSheet.flatten(banner.props.style).borderRadius).toBeUndefined();
    expect(minHeightsAround(title)).toContain(200);
    expect(deck.queryByText("High priority")).not.toBeOnTheScreen();
    expect(deck.queryByText("0 cards")).not.toBeOnTheScreen();
    expect(
      within(selectedTab()).queryByRole("header", { name: "Atraxa" }),
    ).not.toBeOnTheScreen();
  });
  test("the deck name becomes the header title once the banner scrolls under the header, and goes again when it scrolls back", async () => {
    ownDecks([{ name: "Atraxa", priority: "high", card_count: 0 }]);
    const deck = await openDeck();
    const { block: banner } = placeInScrollView(
      deck.getByRole("header", { name: "Atraxa" }),
    );
    await fireEvent(banner, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 300 } },
    });
    expect(pushedScreenTitle()).toBe("");

    await scrollPushedScreenTo(100);
    expect(pushedScreenTitle()).toBe("");

    await scrollPushedScreenTo(300);
    expect(pushedScreenTitle()).toBe("Atraxa");

    await scrollPushedScreenTo(0);
    expect(pushedScreenTitle()).toBe("");
  });

  test("has Close on the left and a More button on the right, and Close goes back to the gallery", async () => {
    ownDecks([{ name: "Atraxa", ...medium }]);
    await openDeck();

    expect(leftHeaderButtons(pushedScreen())).toEqual(["Close"]);
    expect(headerButton(pushedScreen(), "Close")).toMatchObject({
      type: "button",
      symbol: "xmark",
    });
    expect(tabHeader(pushedScreen()).buttons).toEqual(["More"]);
    expect(headerButton(pushedScreen(), "More")).toMatchObject({
      symbol: "ellipsis",
    });

    await pressHeaderButton(pushedScreen(), "Close");

    expect(() => pushedScreen()).toThrow("No screen is pushed");
    expect(tabHeader(selectedTab()).title).toBe("Decks");
  });

  test("the segmented control switches between Cards and History", async () => {
    ownDecks([{ name: "Atraxa", ...medium }]);
    const deck = await openDeck();
    expect(
      deck.getByRole("radio", { name: "Cards", checked: true }),
    ).toBeOnTheScreen();

    await fireEvent.press(deck.getByRole("radio", { name: "History" }));

    expect(
      deck.getByRole("radio", { name: "History", checked: true }),
    ).toBeOnTheScreen();
    expect(deck.getByText("Created 15 October 2026")).toBeOnTheScreen();
    expect(deck.queryByText("No cards yet")).not.toBeOnTheScreen();

    await fireEvent.press(deck.getByRole("radio", { name: "Cards" }));

    expect(deck.getByText("No cards yet")).toBeOnTheScreen();
  });

  test("an empty deck says it has no commander and no cards, and Open Collection opens the Collection tab", async () => {
    ownDecks([{ name: "Atraxa", ...medium }]);
    const deck = await openDeck();

    const commander = deck.getByRole("header", { name: "Commander" });
    expect(commander).toHaveStyle({ color: primary });
    expect(appearsBefore(commander, deck.getByText("No commander yet."))).toBe(
      true,
    );
    expect(
      deck.getByLabelText(
        "No cards yet, Add cards from a copy's page in your collection.",
      ),
    ).toBeOnTheScreen();

    await fireEvent.press(
      deck.getByRole("button", { name: "Open Collection" }),
    );

    expect(() => pushedScreen()).toThrow("No screen is pushed");
    expect(tabHeader(selectedTab()).title).toBe("Collection");
  });

  test("until the deck read returns, the deck screen shows the deck skeleton, then the deck", async () => {
    ownDecks([{ name: "Atraxa", ...medium }]);
    const decks = await openDecks();
    const reads = holdDeckReads();

    await fireEvent.press(decks.getByRole("button", { name: /^Atraxa(,|$)/ }));

    const deck = within(pushedScreen());
    expect(
      deck.getByRole("progressbar", { name: "Loading deck" }),
    ).toBeOnTheScreen();
    expect(
      deck.queryByRole("header", { name: "Atraxa" }),
    ).not.toBeOnTheScreen();
    expect(leftHeaderButtons(pushedScreen())).toEqual(["Close"]);

    await reads.finish();

    expect(
      await deck.findByRole("header", { name: "Atraxa" }),
    ).toBeOnTheScreen();
    expect(
      deck.queryByRole("progressbar", { name: "Loading deck" }),
    ).not.toBeOnTheScreen();
  });

  test("VoiceOver reads the deck skeleton as one element and not each block", async () => {
    ownDecks([{ name: "Atraxa", ...medium }]);
    const decks = await openDecks();
    holdDeckReads();

    await fireEvent.press(decks.getByRole("button", { name: /^Atraxa(,|$)/ }));

    const skeleton = within(pushedScreen()).getByRole("progressbar", {
      name: "Loading deck",
    });
    expect(skeleton).toHaveProp("accessible", true);
    expect(within(skeleton).queryAllByLabelText(/./)).toEqual([]);
  });

  test("a deck that could not load says so, keeps Close, and Try again reads it again", async () => {
    ownDecks([{ name: "Atraxa", ...medium }]);
    const decks = await openDecks();
    failDeckReads(1);

    await fireEvent.press(decks.getByRole("button", { name: /^Atraxa(,|$)/ }));

    const deck = within(pushedScreen());
    expect(await deck.findByText("Could not load this deck")).toBeOnTheScreen();
    expect(leftHeaderButtons(pushedScreen())).toEqual(["Close"]);

    await fireEvent.press(deck.getByRole("button", { name: "Try again" }));

    expect(
      await deck.findByRole("header", { name: "Atraxa" }),
    ).toBeOnTheScreen();
  });
});

describe("the deck menu", () => {
  async function openDeck(
    seed: Partial<Pick<Deck, "priority" | "card_count">> = {},
  ) {
    ownDecks([
      { name: "Kinnan", ...medium },
      { name: "Atraxa", ...medium, ...seed },
    ]);
    const decks = await openDecks();
    await fireEvent.press(decks.getByRole("button", { name: /^Atraxa(,|$)/ }));
    const deck = within(pushedScreen());
    await deck.findByRole("header", { name: "Atraxa" });
    return deck;
  }

  function deckWrites(name: string) {
    return deckWritesSent().flatMap((write) =>
      write.name === name ? [write.request] : [],
    );
  }

  async function chooseFromMenu(...path: string[]) {
    await pressHeaderMenuAction(pushedScreen(), "More", path);
  }

  test("More has Rename, Priority with High, Medium, and Low, and Delete deck in red", async () => {
    await openDeck();

    expect(headerMenuRows(pushedScreen(), "More")).toEqual([
      { title: "Rename", destructive: false },
      {
        title: "Priority",
        destructive: false,
        rows: [
          { title: "High", destructive: false },
          { title: "Medium", destructive: false, checked: true },
          { title: "Low", destructive: false },
        ],
      },
      { title: "Delete deck", destructive: true },
    ]);
  });

  test("More shows pencil for Rename, flag for Priority, and trash for Delete deck", async () => {
    await openDeck();

    expect(headerMenu(pushedScreen(), "More").items).toEqual([
      { title: "Rename", symbol: "pencil" },
      { title: "Priority", symbol: "flag" },
      { title: "Delete deck", symbol: "trash" },
    ]);
  });

  test("Rename opens a native alert with the name filled in, and Cancel and Save", async () => {
    await openDeck();

    await chooseFromMenu("Rename");

    expect(presentedAlertWithField()).toEqual({
      title: "Rename deck",
      message: "Name your deck.",
      field: { placeholder: "Deck name", maxLength: 64, text: "Atraxa" },
      buttons: [
        { label: "Cancel", enabled: true },
        { label: "Save", enabled: true },
      ],
    });
  });

  test("Save renames the deck with the trimmed name, and the banner shows it", async () => {
    const deck = await openDeck();
    await chooseFromMenu("Rename");
    await typeInAlertField("  Atraxa Superfriends ");

    await pressAlertWithFieldButton("Save");

    expect(deckWrites("rename_deck")).toEqual([
      { deck_id: "deck-2", name: "Atraxa Superfriends" },
    ]);
    expect(
      await deck.findByRole("header", { name: "Atraxa Superfriends" }),
    ).toBeOnTheScreen();
    expect(presentedAlertWithField()).toBeNull();
  });

  test("Cancel in the rename alert keeps the name", async () => {
    const deck = await openDeck();
    await chooseFromMenu("Rename");
    await typeInAlertField("Kinnan");

    await pressAlertWithFieldButton("Cancel");

    expect(deckWrites("rename_deck")).toEqual([]);
    expect(deck.getByRole("header", { name: "Atraxa" })).toBeOnTheScreen();
  });

  test("a rename that fails shows an alert and keeps the name", async () => {
    const deck = await openDeck();
    failDeckWrites(1);
    await chooseFromMenu("Rename");
    await typeInAlertField("Kinnan");

    await pressAlertWithFieldButton("Save");

    expect(presentedAlert()).toEqual({
      title: "Could not rename this deck",
      message: "Check your connection.",
      buttons: ["OK"],
    });
    expect(deck.getByRole("header", { name: "Atraxa" })).toBeOnTheScreen();
    expect(decksOnTheServer().map((saved) => saved.name)).toEqual([
      "Kinnan",
      "Atraxa",
    ]);
  });

  test("renaming a deck that was deleted elsewhere goes back to the gallery", async () => {
    await openDeck();
    deleteDeckOnTheServer("deck-2");
    await chooseFromMenu("Rename");
    await typeInAlertField("Kinnan");

    await pressAlertWithFieldButton("Save");

    expect(presentedAlert()).toBeNull();
    expect(() => pushedScreen()).toThrow("No screen is pushed");
    expect(
      await within(selectedTab()).findByRole("button", {
        name: /^Kinnan(,|$)/,
      }),
    ).toBeOnTheScreen();
    expect(
      within(selectedTab()).queryByRole("button", { name: /^Atraxa(,|$)/ }),
    ).not.toBeOnTheScreen();
  });

  test("a priority sets the deck priority, and the check mark follows it", async () => {
    await openDeck();

    await chooseFromMenu("Priority", "Low");

    expect(deckWrites("set_deck_priority")).toEqual([
      { deck_id: "deck-2", priority: "low" },
    ]);
    await waitFor(() =>
      expect(headerMenuRows(pushedScreen(), "More")[1].rows).toEqual([
        { title: "High", destructive: false },
        { title: "Medium", destructive: false },
        { title: "Low", destructive: false, checked: true },
      ]),
    );
  });

  test("a priority change that fails shows an alert and keeps the priority", async () => {
    const deck = await openDeck({ priority: "high" });
    failDeckWrites(1);

    await chooseFromMenu("Priority", "Low");

    expect(presentedAlert()).toEqual({
      title: "Could not change the deck priority",
      message: "Check your connection.",
      buttons: ["OK"],
    });
    expect(headerMenuRows(pushedScreen(), "More")[1].rows).toContainEqual({
      title: "High",
      destructive: false,
      checked: true,
    });
    expect(decksOnTheServer().map((saved) => saved.priority)).toEqual([
      "medium",
      "high",
    ]);
  });

  test.each([
    [0, "Its history is deleted. This cannot be undone."],
    [
      1,
      "Its 1 card becomes free, and its history is deleted. This cannot be undone.",
    ],
    [
      96,
      "Its 96 cards become free, and its history is deleted. This cannot be undone.",
    ],
  ])(
    "Delete deck asks first, naming the deck, the cards that become free, and the deleted history (%i)",
    async (cardCount, message) => {
      await openDeck({ card_count: cardCount });

      await chooseFromMenu("Delete deck");

      expect(presentedAlert()).toEqual({
        title: "Delete Atraxa?",
        message,
        buttons: ["Delete deck", "Cancel"],
      });
      expect(deckWrites("delete_deck")).toEqual([]);
    },
  );

  test("confirming Delete deck deletes the deck and goes back to the gallery", async () => {
    await openDeck();
    await chooseFromMenu("Delete deck");

    await pressAlertButton("Delete deck");

    expect(deckWrites("delete_deck")).toEqual([{ deck_id: "deck-2" }]);
    expect(() => pushedScreen()).toThrow("No screen is pushed");
    expect(tabHeader(selectedTab()).title).toBe("Decks");
    expect(
      await within(selectedTab()).findByRole("button", {
        name: /^Kinnan(,|$)/,
      }),
    ).toBeOnTheScreen();
    expect(
      within(selectedTab()).queryByRole("button", { name: /^Atraxa(,|$)/ }),
    ).not.toBeOnTheScreen();
  });

  test("Cancel in the delete alert keeps the deck open", async () => {
    const deck = await openDeck();
    await chooseFromMenu("Delete deck");

    await pressAlertButton("Cancel");

    expect(deckWrites("delete_deck")).toEqual([]);
    expect(deck.getByRole("header", { name: "Atraxa" })).toBeOnTheScreen();
  });

  test("a delete that fails shows an alert and keeps the deck open", async () => {
    const deck = await openDeck();
    failDeckWrites(1);
    await chooseFromMenu("Delete deck");

    await pressAlertButton("Delete deck");

    expect(presentedAlert()).toEqual({
      title: "Could not delete this deck",
      message: "Check your connection.",
      buttons: ["OK"],
    });
    expect(deck.getByRole("header", { name: "Atraxa" })).toBeOnTheScreen();
    expect(decksOnTheServer()).toHaveLength(2);
  });
});
