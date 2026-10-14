---
version: alpha
name: mtgscan
description: Dark, card-first phone app for scanning Magic cards, keeping a collection, and building Commander decks with AI deck suggestions.
colors:
  background: "#080b0d"
  surface: "#11171a"
  surface-raised: "#1a2125"
  surface-control: "#232c31"
  sheet: "#161c1f"
  line: "#2a3238"
  text: "#ffffff"
  text-muted: "#b5c0c5"
  text-dim: "#7d8a90"
  text-price: "#e4e8ea"
  glass-text-muted: "#dce3e6"
  glass-text-dim: "#b5c0c5"
  glass-skeleton: "#ffffff1f"
  primary: "#d8ff62"
  on-primary: "#101500"
  grabber: "#4a555b"
  danger-tint: "#ff7a7029"
  quantity-badge: "#000000d1"
  warning: "#f4d06f"
  danger: "#ff7a70"
  incoming: "#d8ff62"
  outgoing: "#ff8a7a"
  info: "#8fd3ff"
  badge: "#e0244a"
  card-outline: "#ff4fd8"
  camera-off: "#000000"
  rarity-common: "#e6e8e9"
  rarity-uncommon: "#a7bccb"
  rarity-rare: "#e2bd5a"
  rarity-mythic: "#f26a35"
  rarity-special: "#b48ef0"
typography:
  large-title:
    fontFamily: SF Pro Display
    fontSize: 28px
    fontWeight: 800
    lineHeight: 1.1
  card-title:
    fontFamily: SF Pro Display
    fontSize: 20px
    fontWeight: 800
    lineHeight: 1.15
  sign-in-title:
    fontFamily: SF Pro Display
    fontSize: 24px
    fontWeight: 800
    lineHeight: 1.15
  brand:
    fontFamily: SF Pro Display
    fontSize: 22px
    fontWeight: 800
  sheet-title:
    fontFamily: SF Pro Text
    fontSize: 17px
    fontWeight: 800
  body:
    fontFamily: SF Pro Text
    fontSize: 14px
    lineHeight: 1.35
  body-strong:
    fontFamily: SF Pro Text
    fontSize: 14px
    fontWeight: 700
  field:
    fontFamily: SF Pro Text
    fontSize: 14px
  meta:
    fontFamily: SF Pro Text
    fontSize: 12px
  price:
    fontFamily: SF Pro Text
    fontSize: 12px
    fontWeight: 600
  chip:
    fontFamily: SF Pro Text
    fontSize: 11px
    fontWeight: 700
  sign-in-button:
    fontFamily: SF Pro Text
    fontSize: 17px
    fontWeight: 600
  google-button:
    fontFamily: SF Pro Text
    fontSize: 16px
    fontWeight: 500
  credit:
    fontFamily: SF Pro Text
    fontSize: 10px
    fontWeight: 600
  tab-label:
    fontFamily: SF Pro Text
    fontSize: 10px
    fontWeight: 700
rounded:
  xs: 4px
  sm: 8px
  md: 12px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    padding: 10px 12px
    height: 38px
  button-secondary:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.sm}"
    padding: 10px 12px
    height: 38px
  button-try-again-sign-in:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.sign-in-button}"
    rounded: "{rounded.sm}"
    height: 50px
  button-apple:
    backgroundColor: "#ffffff"
    textColor: "#000000"
    rounded: "{rounded.sm}"
    height: 50px
  button-google:
    backgroundColor: "#131314"
    textColor: "#e3e3e3"
    typography: "{typography.google-button}"
    rounded: "{rounded.sm}"
    height: 50px
  button-google-border:
    backgroundColor: "#8e918f"
    width: 1px
  brand-mark-outline:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.xs}"
    width: 2.5px
  quantity-badge:
    backgroundColor: "{colors.quantity-badge}"
    textColor: "{colors.text}"
    typography: "{typography.tab-label}"
    rounded: "{rounded.full}"
    padding: 0 5px
    height: 19px
  chip:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.text}"
    typography: "{typography.chip}"
    rounded: "{rounded.md}"
    padding: 3px 9px
    height: 24px
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 10px
  sheet:
    backgroundColor: "{colors.sheet}"
    rounded: "{rounded.md}"
  sheet-grabber:
    backgroundColor: "{colors.grabber}"
    rounded: "{rounded.full}"
    width: 36px
    height: 5px
  tab-bar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-dim}"
    typography: "{typography.tab-label}"
  tab-bar-selected:
    textColor: "{colors.primary}"
  count-badge:
    backgroundColor: "{colors.badge}"
    textColor: "{colors.text}"
    typography: "{typography.chip}"
    rounded: "{rounded.full}"
    padding: 0 4px
    height: 17px
  card-thumbnail:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.xs}"
    width: 40px
    height: 56px
  meta-text:
    textColor: "{colors.text-muted}"
    typography: "{typography.meta}"
  current-price:
    textColor: "{colors.text-price}"
    typography: "{typography.price}"
  current-price-missing:
    textColor: "{colors.text-dim}"
  change-line-incoming:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.incoming}"
    rounded: "{rounded.sm}"
  change-line-outgoing:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.outgoing}"
    rounded: "{rounded.sm}"
  chip-warning:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.warning}"
    rounded: "{rounded.md}"
  chip-danger:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
  chip-info:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.info}"
    rounded: "{rounded.md}"
  scan-card-outline:
    backgroundColor: "{colors.card-outline}"
    width: 3px
  scan-camera:
    backgroundColor: "{colors.camera-off}"
  gallery-progress:
    backgroundColor: "{colors.line}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.full}"
    height: 4px
  latest-scan-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 8px
  latest-scan-chip-meta-glass:
    textColor: "{colors.glass-text-muted}"
  latest-scan-chip-chevron-glass:
    textColor: "{colors.glass-text-dim}"
  scan-quick-actions:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.text}"
    typography: "{typography.chip}"
    rounded: "{rounded.md}"
    padding: 0 12px
    height: 32px
  scan-quick-actions-disabled:
    textColor: "{colors.text-dim}"
  scan-quick-actions-disabled-glass:
    textColor: "{colors.glass-text-dim}"
  scan-quick-actions-divider:
    backgroundColor: "{colors.line}"
    height: 16px
  latest-scan-skeleton:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.xs}"
  latest-scan-skeleton-glass:
    backgroundColor: "{colors.glass-skeleton}"
  latest-scan-skeleton-title-bar:
    height: 14px
  latest-scan-skeleton-meta-bar:
    height: 12px
  pull-indicator:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    padding: 0 12px
    height: 38px
  swipe-to-confirm:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    padding: 0 4px
    height: 52px
  swipe-to-confirm-handle:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    height: 44px
---

# mtgscan design

## Overview

mtgscan is an iPhone app for Commander players. Anyone can sign up, and each user's data is private to that user. It scans Magic cards one at a time, keeps the collection, and turns AI deck suggestions into deck changes that the user controls. The interface is dark and card-first. Real card images carry the color, and the chrome stays quiet around them.

Three ideas shape every screen:

- **The card is the hero.** Card images are large and recognizable. Text supports the image and never replaces it.
- **The user decides.** The AI only writes deck suggestions. Every deck change, planned swap, and buylist card is the user's action. Nothing changes a deck without a tap.
- **No noise about confidence.** The scanner always shows its best guess, and the user switches it in one tap when needed. Confidence numbers are never shown.

This file records the design settled in Wayfinder tickets #11 (scan batch flow) and #18 (AI deck changes, history, and planned swaps). Domain terms follow `GLOSSARY.md`.

The tokens at the top of this file are the app theme. `apps/mobile/src/theme.ts` holds them, and the NativeWind theme is built from it. Each token is a class with the same name: `bg-surface-control` and `text-text-muted` for colors, `text-body-strong` for a type style, `rounded-sm` for a corner, and `gap-xs` or `py-lg` for spacing. New UI uses these classes, not inline style objects.

## Colors

The palette is near-black neutrals with one lime accent. Card art supplies every other color.

- **Background (#080b0d)** is the screen base. **Surface (#11171a)** holds cards and grouped content. **Surface raised (#1a2125)** and **surface control (#232c31)** separate inner rows, buttons, chips, and segmented controls. **Sheet (#161c1f)** is the iOS page sheet and the settings drawer. **Line (#2a3238)** draws hairlines and empty image slots.
- **Text (#ffffff)** is primary. **Text muted (#b5c0c5)** is for printing details and captions. **Text dim (#7d8a90)** is for unselected tab labels and quiet metadata. **Text price (#e4e8ea)** is for the current price under a binder tile, slightly brighter than the meta line.
- **Glass text muted (#dce3e6)** and **glass text dim (#b5c0c5)** replace text muted and text dim on Liquid Glass, so the meta line, the chevron, and disabled labels stay readable when a bright card shows through. **Glass skeleton (white at 12%)** replaces line for the skeleton blocks and the empty thumbnail on glass. The owner picked it on the phone from four shades (#113). See Liquid Glass.
- **Primary (#d8ff62)**, the lime accent, is the single interaction color: the primary button, the selected chip, the selected tab, section headings, and in-app links. Text on it is **on-primary (#101500)**. The brand mark is the one non-action use of lime.
- **Grabber (#4a555b)** draws the short bar at the top of the sign-in sheet. The settings drawer uses the iOS system grabber, which iOS draws in its own color.
- **Danger tint (#ff7a70 at 16%)** fills the round mark beside a failure message and the destructive buttons. **Quantity badge (black at 82%)** fills the quantity badges on the sign-in binder wall.
- **Incoming (#d8ff62)** and **outgoing (#ff8a7a)** mark the plus and minus lines of a deck suggestion, planned swap, or deck change.
- **Warning (#f4d06f)** marks protected copies and caution states. **Danger (#ff7a70)** marks invalid decks and destructive actions such as remove scan or revert. **Info (#8fd3ff)** marks the estimated bracket and in-deck counts.
- **Badge (#e0244a)** is only for count badges on tabs and buttons, such as Needs you.
- **Card outline (#ff4fd8)** is the magenta line the scanner draws around a detected card. Nothing else uses it.
- **Camera off (#000000).** The Scan tab is pure black until the camera feed replaces it.
- **Rarity colors** tint the set symbol on binder tiles by the card printing's rarity. They follow Magic's own rarity colors, made flat and lighter for the dark UI: **rarity common (#e6e8e9)** light grey, **rarity uncommon (#a7bccb)** silver, **rarity rare (#e2bd5a)** gold, **rarity mythic (#f26a35)** orange-red, and **rarity special (#b48ef0)** purple for special and bonus. This is the one use of color on set symbols. Elsewhere, such as the quick-action bar, set symbols use the text color. A rarity the app does not know falls back to the text color.

## Typography

The app uses the iOS system font, SF Pro, at a few weights.

- **Large title** (28 px, heavy) names top-level tabs: Recent, Collection, Decks.
- **Sign-in title** (24 px, heavy) is the one line on the sign-in sheet. **Brand** (22 px, heavy) sets the mtgscan name next to the brand mark.
- **Card title** (20 px, heavy) names a card on the card page, and a deck in the deck header and the commander gallery.
- **Sheet title** (17 px, heavy) titles page sheets.
- **Body** (14 px) carries reasons, rules text, and list content. **Body strong** labels buttons and card names in rows. **Field** (14 px) is the text in a text field, such as the card name in name search. It has no fixed line height, so iOS centers the text in the field.
- **Meta** (12 px, muted) carries set and collector number, finish, condition, language, and timestamps.
- **Price** (12 px, semibold, text price) carries the current price under a binder tile.
- **Chip** (11 px, bold) labels chips and status pills. **Tab label** (10 px, bold) sits under tab bar icons. **Credit** (10 px, semibold, dim) credits image sources such as Scryfall.

Copy is plain sentence case and uses glossary terms exactly: deck suggestion, planned swap, buylist card, free copy, protected copy, estimated bracket.

## Layout

The app is built for an iPhone in portrait. The page inset is 16 px, cards sit 12 px from the edges, and rows use 8 px gaps.

### App shell

A bottom tab bar holds four tabs, in this order: **Recent, Collection, Decks, Scan**. Recent has a count badge for the items that need the user.

- **Recent** is the home across all decks. It holds only the Needs you items, **oldest first**: open deck suggestions, planned swaps ready to swap in, and open buylist cards (owner decision, spec 4). Deck changes stay in each deck's History tab. Collection changes do not appear in Recent.
  - Each item carries a tag with the commander avatar and deck name. The tag opens that deck.
  - Filter chips: All, Suggestions, Planned swaps, Buylist.
  - Every item keeps its actions inline: Promote, Dismiss, Swap in, and Bought.
- **Collection** is a binder grid with the collection total in its header.
  - The header has the collection total button next to the settings button (owner decision, #125). See Collection header.
  - Card images sit 3 per row, with **one tile per copy** and no quantity badge. Three copies of a card printing make three tiles (owner decision, #116).
  - Copies of the same card printing sit next to each other. The card printing with the newest addition comes first. More tiles load as the user scrolls. The tab reloads when it gains focus.
  - With no collection entries, the tab shows "Your collection is empty" and "Scan cards to add them to your collection."
  - When the read fails, the tab shows "Could not load your collection" and "Check your connection." with a **Try again** button.
  - One quiet meta line under each card shows the set icon in its rarity color, the collector number, and the condition when it is not NM. Foil and etched copies carry a sheen on the card image instead of a finish label. Later, badges also show whether the copy is in a deck, held by a planned swap, or protected.
  - A price line under the meta line shows the copy's current price (owner decision, #120). A copy with no current price shows "–". A stale price has a clock symbol.
  - A native search bar sits under the large title. See Collection search. Filters: All, Free, Allocated, Protected.
- **Decks** is a commander gallery: one large commander art card per row, highest priority first. The name, priority, validity, and estimated bracket sit over the art, with a Needs you count.
- **Scan** is a black screen that the camera feed replaces. The batch button sits top right, and the latest-scan chip sits at the bottom.
  - Until the gallery is on the phone, the camera stays off and the tab shows the gallery download:
    - "Downloading gallery" with a progress bar and the megabytes done of the total, such as "12.3 MB of 68.5 MB".
    - "Waiting for Wi-Fi" with the progress bar and a **Download now** button. The gallery downloads only on Wi-Fi until the user taps **Download now**, which uses mobile data.
    - "Gallery download paused. It continues when you are online." with a **Try again** button, when the phone is offline.
    - "Gallery download did not work." with a **Try again** button, when a part fails its SHA-256 check three times or the download is refused.
    - "Not enough space for the gallery. It needs 269.4 MB." with a **Try again** button. The number is the space that this download and install need.
  - A gallery update downloads in the background. Scanning goes on with the installed gallery, and the app switches to the new one when it is installed.
  - The first time the user opens Scan with the gallery on the phone, iOS asks for camera access.
  - When camera access is off, the tab shows "Camera access is off." with an **Open Settings** button.
  - On a device without a camera, such as the Simulator, the tab shows "Camera not available".
  - The magenta card outline draws only around a detected card.
  - After three failed photos in a row or a camera error, the camera stops. The tab shows "Camera stopped." with a **Try again** button.
  - The camera stops when the user leaves Scan or the app.
  - Pulling down on the Scan tab adds the scan batch to the collection without opening batch review (owner decision, #130). It works in every Scan tab state, also over "Camera not available".
    - While the finger moves down, the pull indicator slides down from under the top of the screen. It says "Pull to add 3 cards". The number is the batch button's count.
    - At 120 pt the indicator reaches its place, 8 px below the safe area, and says "Release to add 3 cards". The phone plays a light impact haptic as the pull crosses 120 pt.
    - Releasing past 120 pt adds the scan batch with the same commit as **Add to collection**. The indicator says "Adding 3 cards" with a spinner until the commit ends. A commit that works clears the batch button's badge and leaves the chip empty, as after **Add to collection**. The indicator then slides away.
    - A commit that fails shows "Failed to add" with the danger mark in the same pill for 4 seconds (owner decision, #130). The pill then slides away. VoiceOver announces "Failed to add. Your scans are kept." The scan batch is kept, and batch review offers **Try again**.
    - Releasing before 120 pt, or moving back above 120 pt and then releasing, adds nothing. The indicator slides away.
    - With no scan to add, the indicator says "Nothing to add", there is no haptic, and releasing does nothing.
    - A pull counts only when it starts below the batch button, so it does not fight Notification Center at the top edge. It does not start while a card is being recognized or while an add runs. A release adds nothing when a card started to be recognized during the pull. The camera keeps running during the pull.
    - VoiceOver users add the scan batch with the batch button's action "Add 3 cards to collection". The action is there only when the batch has a scan to add, no card is being recognized, and no add runs.
  - Taking a photo makes no shutter sound where iOS allows it, and no haptic. When the latest-scan chip shows a recognized card, the phone plays a heavy impact haptic and a soft two-note blip. When recognition fails, it plays a warning haptic and a lower tone. A photo that is not a card plays neither. The sounds follow the Ring/Silent switch, and a Scan sounds switch in settings turns them off (#82).

### Tab headers

Recent, Collection, and Decks use the native iOS navigation bar as their tab header (owner decision, #128). Each tab is a native stack.

- At the top, the tab header shows the large title in large title type.
- The settings button and any header actions sit on the right of the bar, above the large title.
- When the user scrolls, the large title collapses into the inline title in sheet title type.
- The bar and its buttons stay at the top. The content scrolls under the bar.
- The header buttons are native bar buttons in the text color. A tab can put more header actions before the settings button, as Collection does with the collection total button.
- On iOS 26, the bar buttons are Liquid Glass. Content that scrolls under the bar blurs and fades behind it with the system scroll edge effect. There is no line under the bar.
- On iOS 18 and earlier, the bar is the standard iOS navigation bar, with no Liquid Glass.

### Collection header

The collection total is always visible. The owner picked variant C of the HTML prototype (`prototypes/collection-copies/index.html` on `prototype/first-release`, commit bbe3f0f).

- **Collection total button.** A native bar button before the settings button. It shows the collection total in full, such as "$2,419.59".
- The total is the sum of every copy's current price for its card printing and finish. Copies with no current price are left out and counted in the coverage, so a missing price never silently lowers the total. The currency is USD for now.
- With no collection entries, or before the total loads, the header shows no total button.
- **Menu.** Tapping the button opens a native menu under the button. A tap outside closes it. It holds:
  - the credit "Current prices from Scryfall, in USD" as the menu title;
  - the change, such as "+$12.40" or "−$38.75", with the subtitle "Since yesterday";
  - the coverage, such as "26 of 27 cards", with the subtitle "Priced".
- The change and coverage rows show information. They are disabled menu items, so a tap on them does nothing, and iOS shows them dimmed.
- The change is neutral. The sign carries the direction: + or the minus sign. There is no green or red. No change shows "$0.00" with no sign. When there is no daily collection total from the day before, such as before the first one, the change is "–".
- The change is the collection total now minus the daily collection total of the day before the current prices. mtgscan stores a daily collection total for each user after the daily price import. Copies added since then count in the change.
- **VoiceOver.** The button reads "Collection total, $2,419.59" with the hint "up $12.40 since yesterday, 26 of 27 cards priced". A falling total says "down", no change says "no change since yesterday", and with no daily collection total from the day before it says "change since yesterday not known yet".

### Collection search

The owner picked layout B of the HTML prototype (`prototypes/collection-management/collection-tab.html` on `prototype/collection-management`, commit 84a51cb).

- **Search bar.** The native iOS search bar sits under the large title, with the placeholder "Search your collection". It stays visible when the grid scrolls. Its caret and Cancel are primary lime.
- Typed text matches card names, type lines, and Oracle text, in the collection only. A word that starts with a known key, such as `set:m`, is not sent as text.
- **Suggestions.** While the user types, suggestions replace the grid. Each suggestion is a list row.
  - With no key typed, they offer the keys that start with the typed word, such as "set:" with "Set code".
  - After a key, they offer values: set codes from the card catalog with the set name, Oracle tags from the tag lookup with the tag label, and the fixed lists for finish, condition, language, rarity, and color.
  - Tapping a key puts it in the search bar. Tapping a value makes a chip. Enter closes the suggestions and shows the results.
- **Chips.** A space, Enter, or a picked suggestion turns `key:value` text into a chip.
  - The keys are `name`, `type`, `color`, `identity`, `mv`, `pow`, `tou`, `price` (with `=`, `<`, `<=`, `>`, `>=`), `tag`, `keyword`, `set`, `rarity`, `finish`, `condition`, `lang`, `is:commander`, `is:gamechanger`, `is:free`, and `is:protected`.
  - A value with spaces is quoted, as in `name:"sol ring"`. A leading `-` negates, as in `-rarity:common`. The number keys and `identity` cannot be negated, because collection search has no exclude field for them.
  - A key that the app does not know stays as text.
- The app turns the text and the chips into the typed collection search query. The server never parses a string.
- Chips sit under the search bar, at the top of the grid. Each chip shows its `key:value` text and ×. Tapping a chip removes it. Backspace in an empty field removes the last chip. Cancel clears the text and the chips.
- **Results.** Results show as binder tiles, one per copy. While text or a chip is active, a count line in meta text, such as "6 of 27 copies", sits above the grid. With no results, the grid shows "No cards found."
- A chip that the server refuses, such as an unknown set or Oracle tag, turns danger. The grid shows "No set named "zzz".", "No Oracle tag named "zzz".", or "No keyword named "zzz".". Any other refused chip shows "mv>25 is not a valid chip."
- VoiceOver reads a chip as a button with its `key:value` text and the hint "Removes this chip."

### Sign-in screen

The app shows the sign-in screen whenever there is no session. It is the binder wall design (prototype `prototypes/sign-in/index.html?variant=D`, commit 4b31c79 on `prototype/first-release`).

- **Binder wall.** Three columns of card images fill the screen behind everything else. The wall is tilted 6 degrees, dimmed to half opacity, and darkened at the top and bottom. Some tiles carry a quantity badge. Each column drifts slowly upward at its own speed, between 70 and 90 seconds per loop. With Reduce Motion on, the wall stands still.
- **Card images** are 18 fixed Commander staples and commanders from Scryfall's image CDN. They are cached on the device. Until an image loads, its tile is a dark line-colored card shape, so the screen works offline.
- **Brand.** The brand mark and the mtgscan name sit at the top left.
- **Sheet.** A bottom sheet with a grabber holds the copy and the actions: the title "Every card you own, in one binder.", the line "Scan your cards, see what each one is worth, and build Commander decks from them.", the sign-in buttons, "Your collection and decks stay private." with a **Privacy policy** link, and the credit "Card images from Scryfall". The link opens https://mtgscan.reilley.dev/privacy in the system browser.
- **Sign-in buttons** stack in one column with 8 px gaps: **Sign in with Apple** first, then **Continue with Google**.
- **Signing in.** The tapped button shows a spinner in place of its logo, and every sign-in button is disabled. Other sign-in buttons fade to 38% opacity. The system Apple button cannot show a spinner. While Apple sign-in runs, a white button of the same size with a black spinner takes its place.
- **Cancel.** Cancelling the provider prompt returns to the buttons with no message.
- **Failure.** A failure replaces the buttons with "Sign-in did not work." in a surface card with a danger mark, and a lime **Try again** button. The danger mark is a 22 px danger-tint circle with a danger "!". Try again brings back the buttons.
- **Test sign-in.** Only a development build against local Supabase with `EXPO_PUBLIC_TEST_SIGN_IN` on shows a third button, **Sign in as the test user**, under **Continue with Google**. It uses the control surface and the sign-in button height, and it signs in, fails, and dims like the other sign-in buttons. Production builds leave it out.

### Pushed screens

Pushed screens cover the whole screen, including the app tab bar. There are **no on-screen back buttons**. The user goes back with the phone's own gesture, which on iOS is the swipe from the left edge. The exception is a screen pushed inside a drawer, such as the scan details in batch review, which keeps the native back button (see Sheets).

- **Card page**, from a collection tile, opens that printing:
  - a hero image of the printing over its blurred art;
  - name, type line, and chips for the set code and collector number;
  - a segmented control:
    - **Copies**: counts totalled over every copy of this printing, a one-line summary for the card across printings, this printing's copies listed by collection entry (finish, condition, language, quantity, decks, protected) with a Protect or Unprotect control on each row, and the user's other printings, each opening its own page;
    - **Decks**: deck tags and open deck suggestions with the card, with a badge for them;
    - **Prices**: per finish for this printing, and the value of its copies;
    - **Rules**: Oracle text and Commander legality.
- **Deck screen**, from the gallery or a deck tag:
  - The top bar is a compact header: the commander picture, the deck name, and chips for priority, validity, and estimated bracket. When the deck is not valid, its violations and the bracket signals show under the chips. Nothing else goes in the header.
  - A deck tab bar replaces the app tab bar: **Cards / Suggestions / History**.
    - **Cards** is the deck list. Only "Planned out" is marked.
    - **Suggestions** holds open deck suggestions, planned swaps, and buylist cards with their actions, plus a collapsed Closed and dismissed section. Its tab carries a Needs you badge.
    - **History** holds deck changes with revert from a selected change onward.
  - Opening a deck from Recent lands on Suggestions. From Decks or the Collection it lands on Cards.

### Sheets

Short tasks use iOS page sheets that close with a downward swipe or Done:

- promote with a copy picker;
- Bought with the acquired copy picker;
- the swap-in confirmation for a protected copy;
- revert.

Settings, the scan details sheet, the printing picker, the condition and language pickers, and batch review are bottom drawers, not page sheets. The settings button on Recent, Collection, and Decks opens the settings drawer. The rules below hold for all of them.

- It slides up from the bottom with the iOS grabber.
- A drawer with a lot of content opens at full height and has no half height. These are the scan details sheet, the printing picker, and batch review.
- Settings, the condition and language pickers, and other short drawers open at half the screen height. Dragging one up takes it to full height. Dragging it down takes it back to half height.
- A downward swipe closes it. At half height, a tap outside closes it too. At full height, iOS leaves no screen outside it to tap. It has no Done button.
- Its content starts 32 px (spacing xl) below the top edge, twice the page inset, so that it clears the grabber. The content scrolls at every height.

**One level only.** Drawers and modals (page sheets, alerts, and confirmation sheets) are never stacked: no drawer opens over a drawer, no modal over a modal, no drawer over a modal, and no modal over a drawer. When a task inside a drawer needs another step, such as editing a scan from batch review, it pushes a screen inside the same drawer with a back button and the swipe-back gesture. A confirmation needed from inside a drawer is shown inline in that drawer. Native menus (for example the collection total menu) are not drawers or modals and may open from a drawer.

The settings drawer:

- The title "Settings" stays at the top at either height. The content below the title scrolls under it.
- It shows the signed-in account in a card, a gallery card, a Scan sounds card, and **Sign out** below them. The account card shows the provider of the current sign-in and the account email. Apple and Google sign-ins with the same verified email share one account, so the provider can change between sign-ins.
- The gallery card shows "Gallery", the date of the installed gallery version, such as "12 October 2026", and "Up to date", "Downloading", or "Paused". "Paused" covers waiting for Wi-Fi, offline, a failed download, and too little space.
- The Scan sounds card has a "Scan sounds" switch with a lime track. It is on by default. Turning it off stops the scan sounds and keeps the scan haptics.
- All three cards fit at half height.
- Only a development build shows a "Parity check" section under **Sign out**, with a **Run the parity check** button. After a check, the section lists "Gallery version 20261012-cf1753", "Lowest cosine 0.99976", "Mean cosine 1.00003", and "24 reference images", with the cosines to 5 decimals, then each reference image that failed. When the check cannot run, it shows "Could not run the parity check:" and the error code. Production builds leave it out.

## Elevation & Depth

The interface is flat. Depth comes from tone, not shadow.

- Content sits on surface tones that step up from the background: surface, surface raised, surface control.
- Page sheets slide over a dimmed, slightly scaled screen. The settings drawer slides over a dimmed screen that keeps its size. A soft shadow above the sheet is the only strong shadow. On the sign-in sheet it is black at 55%, 12 px up, with a 40 px blur. `theme.ts` names it `shadows.sheet`. The binder wall scrim on the sign-in screen is the background color at 90% at the top, 20% at 16% of the height, 25% at 45%, and 90% from 62% down. `theme.ts` names it `gradients.binderWallScrim`.
- The foil and etched sheens on binder tiles are diagonal gradients over the card image at 30% opacity (`opacity.sheen`). They sit outside the palette, like card art.
  - **Foil sheen** (`gradients.foilSheen`, 115 degrees): clear to 22%, then pink `rgba(255, 80, 170, 0.55)`, yellow `rgba(255, 230, 90, 0.5)`, mint `rgba(80, 255, 200, 0.5)`, blue `rgba(80, 150, 255, 0.55)`, and violet `rgba(200, 110, 255, 0.5)` from 34% to 66%, then clear from 78%.
  - **Etched sheen** (`gradients.etchedSheen`, 120 degrees): clear to 25%, then white `rgba(255, 255, 255, 0.55)`, silver `rgba(200, 210, 215, 0.25)`, and white again from 42% to 58%, then clear from 75%.
- NativeWind 4 has no class for a box shadow or a gradient, so the shadows, the scrim, and the sheens are style values.
- The tab bar is a near-opaque bar with a hairline top border.
- The controls that float over the camera or over scrolling content use Liquid Glass. See Liquid Glass.
- During a back swipe, the screen follows the finger with a shadow on its left edge.

### Liquid Glass

Liquid Glass is Apple's glass material from iOS 26 (owner decision, #113).

- Only the controls that float over the camera or over scrolling content use glass: the latest-scan chip, the quick-action bar, the batch button, and the pull indicator (owner decisions, #113 and #130), and the tab header buttons (owner decision, #128). Every other surface stays flat.
- The tab header buttons are native bar buttons. iOS 26 draws their glass, so `GlassSurface` does not wrap them.
- The pull indicator does not react to touch. It moves by sliding, never by fading.
- The glass is the regular style with no tint. Glass that the user can tap, such as the chip, the quick-action bar, and the batch button, reacts to touch. The skeleton chip and the basic land chip do not.
- The chip and the quick-action bar sit in one glass group with 8 px spacing, so they blend like iOS controls but do not merge at rest.
- Text on glass:
  - The card name and enabled labels stay text white.
  - The meta line uses glass text muted.
  - The chevron and disabled quick-action labels and symbols use glass text dim.
  - The skeleton blocks and the empty thumbnail use glass skeleton.
- Without Liquid Glass, as on iOS 17 and 18, the chip falls back to surface, and the quick-action bar, the batch button, and the pull indicator to surface control, with the normal text colors.
- The glass never fades with opacity, because glass under opacity 0 stops rendering. The skeleton pulse animates the blocks inside the chip, not the glass.
- `expo-glass-effect` draws the glass. `GlassSurface` and `GlassGroup` in `src/components/atoms/glass-surface.tsx` wrap it.

## Shapes

- Chips and filter pills use 12 px corners. Count badges are fully round.
- Buttons and segmented controls use 8 px corners.
- Content cards and page sheets use 12 px corners. Sheets round only their top corners. The settings drawer keeps the iOS system corners, which match the system grabber.
- Card thumbnails use 4 px corners at a 63:88 card ratio. Full card images keep their own printed shape.
- Binder tiles and the binder wall tiles on the sign-in screen use 8 px corners.

## Components

- **Buttons.** Primary buttons are lime with dark text: Promote, Swap in, Bought, Add to collection. Secondary buttons use the control surface: Dismiss, Skip, Cancel. Destructive actions, such as **Remove scan**, use danger text on the danger tint.
  - A disabled button fades to 38% opacity, the same dimming as the other sign-in buttons while one signs in. `theme.ts` names it `opacity.dimmed`.
  - A busy button shows a spinner before its label and takes no taps. It keeps its full color.
  - A round icon button, such as the settings button or the batch button, is 38 px across on the control surface, with an 18 px symbol in the text color.
  - Every control has a touch target of at least 44 by 44 pt. A control that looks smaller, such as a 38 px button or a 24 px chip, gets the extra touch area above and below, and is at least 44 px wide.
- **Swipe to confirm.** A 52 px lime pill track with a 44 px round handle in on-primary at its left, 4 px inside the track, with a lime arrow. The label sits in the center of the track in body strong, in on-primary. Dragging the handle to the right moves it along the track with the finger. The handle rides a native horizontal scroll view, so the drawer's own drag cannot take the touch when the finger drifts up or down. Past 80% of the track, a light haptic plays, and releasing there confirms. The handle then moves to the end and shows a spinner. It stays at the end with the spinner while the action runs. When the action works and the screen closes, it stays there until the screen is gone. It goes back to the start after a release before 80%, which does nothing. It also goes back when the action fails or leaves the screen open. A busy control shows a spinner on the handle at the end and cannot be swiped. It keeps its full color, even when it is also disabled. A disabled control fades to 38% opacity. VoiceOver reads it as a button with its label, and its default action confirms without a swipe. The scroll padding is the one style that is not a class, because it comes from the track width.
- **Toggles.** A toggle is a button that stays on or off, such as Protect. It uses the control surface when off and turns lime with dark text when on. A segmented control, such as Copies, Decks, Prices, and Rules on the card page, is a row of options on one control surface with 8 px corners. The chosen option is lime.
- **Switch rows.** A switch row is a surface card with a label and an iOS switch with a lime track. A tap anywhere on the row turns the switch on or off.
- **List rows.** A list row is a surface card with an optional thumbnail, a name in body strong, and an optional meta line, such as the set code and collector number.
- **Sign-in buttons.** Sign-in buttons and the sign-in Try again button are 50 px tall to match Apple's sign-in button sizing. This is the one exception to the 38 px button height. Try again uses sign-in button type (17 px, semibold). Continue with Google uses 16 px medium. The system Apple button sets its own type.
- **Sign in with Apple.** The system Apple button in Apple's white style, with the "Sign in with Apple" title and 8 px corners. Apple's branding rules set its colors, logo, and type, so they sit outside the palette.
- **Continue with Google.** Google's dark button style: a #131314 fill, a 1 px #8e918f border, #e3e3e3 text, and the four-color Google logo. Google's branding rules set these colors, so they sit outside the palette.
- **Text links.** An in-app link inside a line of text, such as **Privacy policy**, keeps the type size of its line in bold lime. It is the one control without a 44 pt touch target, because a nested text run cannot take extra touch area.
- **Failure notice.** A surface card with 12 px padding and a danger mark beside the message, such as "Sign-in did not work." A long message wraps in the space beside the mark, and the mark lines up with its first line.
- **Brand mark.** A lime outlined card shape, 18 by 25 px with a 2.5 px border and 4 px corners, beside the mtgscan name. It is the one non-action use of lime.
- **Chips.** Status chips show priority, validity, estimated bracket, finish, condition, language, and copy states such as "2 free" or "Protected only". Their text uses the text, warning, danger, or info color. Filter chips switch to the primary lime when selected. A chip that the user can tap is at least 44 px wide. Search chips show their `key:value` text and × on the control surface, and a tap removes them. A refused search chip has danger text on the danger tint.
- **Count badges.** Red numerals on the Recent tab, the deck Suggestions tab, the batch button, and the card page Decks tab.
- **Change lines.** A deck suggestion, planned swap, or deck change shows a green plus row for the incoming card and a red minus row for the outgoing card. Each row has a thumbnail, the card name, and the type line or printing. The reason follows in body text, with the AI client name and time in meta text.
- **Deck tag.** A small commander avatar plus the short deck name, used on Recent items and card page deck lists. It opens the deck.
- **Latest-scan chip.** One horizontal chip at the bottom of Scan, 16 px from the edges, on Liquid Glass. It has 8 px padding and three columns (owner request, #113):
  - The left column holds the card thumbnail.
  - The middle column holds the card name in body strong, centered over a centered meta line with the set code in capitals and the collector number, such as "M10 146".
  - The right column holds a 14 px text dim `chevron.right` symbol, centered, that shows the chip opens the details. The skeleton chip and the basic land chip have no chevron.
  - The two side columns are both as wide as the card thumbnail, so the name and the meta line sit centered on the chip.
  - A new scan replaces the chip.
  - The meta line adds the finish when it is not nonfoil: "M10 146 · Foil".
  - A quick-action bar sits 8 px below the chip, centered, and is always on the Scan tab. It is one glass pill with 12 px corners and five buttons in chip type, split by 16 px hairline dividers in the line color. Without Liquid Glass, the pill uses the control surface. The bar is 32 px tall, and each button has a 44 pt touch target. From left to right:
    - The finish button shows the current finish: "Nonfoil", "Foil", or "Etched". Tapping it switches to the next finish of the card printing in the order nonfoil, foil, etched. It changes only the scan on the chip. It is disabled when the card printing has one finish.
    - The condition button shows the current condition: "NM", "LP", "MP", "HP", or "DMG". Tapping it opens the condition picker.
    - The set button shows the set's expansion symbol from Scryfall at 16 px, tinted with the text color. VoiceOver reads the set code in capitals, such as "MH3". When the card catalog has no symbol for the set, or it has not loaded, the button shows the set code instead. It opens the printing picker.
    - The language button shows the language as a short code in capitals, such as "EN" or "JA". Tapping it opens the language picker.
    - **+1** adds another copy of the card printing to the scan batch as its own scan, with the same finish, condition, and language. The chip moves to the new scan, so later edits on the chip change only that copy. The chip never shows a copy count.
  - The buttons act on the scan on the chip. Before the first scan, while a photo is being recognized, after a basic land or a scan that was not recognized, after **Remove scan**, and after the scan batch is added to the collection, they are disabled, with text dim labels. Disabled, they show the values a new scan starts with: "Nonfoil", "NM", a dashed square symbol for the set, "EN", and "+1". A photo that is not a card leaves the bar on the previous scan.
  - The condition picker and the language picker are short bottom drawers, titled "Condition" and "Language", with one chip for each value. The current value is the lime chip. Picking a value changes only the scan on the chip and closes the drawer. Every new scan starts at NM and English.
  - The printing picker is a bottom drawer like the scan details sheet, at full height only, with the card name and every card printing of that card in the gallery, as card images 3 per row with the set code and collector number. The scanned card printing and its same-text twins come first, then the rest newest first. The current card printing has a 2 px lime border and a lime caption. Tapping a card printing switches the scan to it and closes the sheet. The scan keeps its finish when the new card printing has it. Otherwise it takes the new card printing's default finish.
  - A pulsing skeleton chip, with an image block and two centered bars in glass skeleton, shows from the moment the app takes the photo until the result arrives. Without Liquid Glass, the blocks are line-colored. The bars are as tall as body strong and meta type, 14 px and 12 px, and fill 70% and 40% of the text width. The blocks pulse between 45% and full opacity, 650 ms each way. VoiceOver reads it as "Recognizing card".
  - A photo that is not a card removes the skeleton chip and brings back the previous chip.
  - A basic land shows its image, its name, and "Basic land, not tracked". It does not enter the scan batch, and tapping it does nothing.
  - A scan that was not recognized shows an empty thumbnail, "Not recognized", and "Tap to search". It is not in the scan batch and lives only on the chip. Tapping it opens the scan details sheet in name search. A card printing picked there adds it to the scan batch as one scan, with the values a new scan starts with. The next scan replaces it on the chip, and it is dropped.
  - After **Add to collection**, the chip is empty until the next scan, as after **Remove scan**. A scan that was not recognized stays on the chip, because it was not added.
  - Tapping the chip opens the scan details sheet.
- **Scan details sheet.** A bottom drawer with the iOS grabber. It opens at full height only and closes with a downward swipe. Its content scrolls, starting 32 px below the top edge. The same scan details show inside batch review when a row opens them.
  - At the top: the card image at 55% of the sheet width, the card name in card title type, and the set code and collector number.
  - **Finish**, **Condition**, and **Language** sections, each with a row of chips. The selected chip is lime. Finish offers only the finishes of the card printing. Condition offers NM, LP, MP, HP, and DMG, and starts at NM. Language offers English, Japanese, German, French, Italian, Spanish, Portuguese, Korean, Russian, Simplified Chinese, and Traditional Chinese, and starts at English.
  - **Other options** lists the recognizer's other candidates as rows with a thumbnail, the name, and the set code and collector number. Every same-text twin comes first. Tapping a row switches the scan to that card printing. The scan keeps its condition and language, and its finish when the new card printing has it. Otherwise it takes the new card printing's default finish.
  - **None of these: search** opens name search in the same sheet.
  - **Remove scan**, a danger button, removes this scan and closes the sheet. The other copies stay in the scan batch. Removing the scan on the chip leaves the chip empty.
  - Section headings are lime body strong text.
- **Name search.** A "Card name" field at the top of the scan details sheet, with the keyboard up. A scan that was not recognized opens the sheet straight into name search.
  - As the user types, up to 10 card names show as rows. The phone matches names and face names in the gallery, ignoring case, accents, and punctuation. Exact names come first, then names that start with the text, then names with a word that starts with it.
  - Tapping a name lists every card printing of that card in the gallery, newest first, as card images 3 per row with the set code and collector number under each.
  - Tapping a card printing switches the scan to it and returns to the details.
  - Choosing a basic land shows "Basic lands are not tracked." and changes nothing.
- **Batch button.** A round icon button on glass at the top right of Scan, 8 px below the safe area, with the `rectangle.portrait.on.rectangle.portrait.angled` card-stack symbol. Without Liquid Glass, it uses the control surface. A count badge on its top right corner counts the scans in the scan batch, the same N as the batch review title. With no scan to add, the button shows no badge. VoiceOver reads "Scan batch, 3". The button shows in every Scan tab state, and it opens batch review.
- **Pull indicator.** A glass pill centered at the top of Scan, on the batch button's row. It is 38 px tall with full corners and 12 px side padding. It holds an 18 px symbol in the text color and its label in body strong, 8 px apart. The symbol is `arrow.down` while pulling and for "Nothing to add", `plus` for "Release to add", a spinner while adding, and the danger mark of the failure notice for "Failed to add". Without Liquid Glass, it uses the control surface. See Scan in Layout for its states.
- **Batch review.** A bottom drawer with the iOS grabber, at full height only. It closes with a downward swipe. Its title is "N cards scanned", such as "3 cards scanned", or "1 card scanned" for one. N counts the scans in the scan batch, the same N as the batch button badge and **Remove N scans**. The title sits in a native navigation bar in sheet title type, on the sheet color with no line under it.
  - A ••• bar button with the `ellipsis` symbol sits on the right of the bar. VoiceOver reads it as "More". It opens a native menu with **Remove all scans** in red. That item opens a submenu with one red item, **Remove N scans**, such as "Remove 3 scans", or "Remove 1 scan" for one. N counts every scan in the scan batch. The second tap is the confirmation, so there is no alert (see Sheets).
  - **Remove N scans** empties the scan batch and closes batch review. The batch button shows no badge, and the latest-scan chip is empty. A card that is still being recognized adds no scan afterwards, and it plays no haptic and no sound. Nothing is added to the collection, and a commit that failed is not sent again.
  - Closing the menu at either step changes nothing.
  - The ••• button is disabled when the scan batch is empty, and hidden while the commit runs.
  - A tap on a row pushes that scan's details into the same drawer, which stays at full height. The pushed details have the native back button, labeled with the drawer title, and go back with the swipe from the left edge too. **Remove scan** removes the copy and returns to the list.
  - **Scans** lists every scan as its own row, newest first. Identical copies are not merged, and rows have no +/- control. A row has the thumbnail, the card name, and a meta line with the set code and collector number, the finish when it is not nonfoil, the condition, and the language: "M10 146 · Foil · NM · English". A tap pushes the scan details, to edit or remove that copy.
  - A swipe to confirm control labeled **Add to collection** stays at the bottom of the drawer. It shows no count. Swiping its handle past 80% of the track adds the scan batch. It is disabled when N is 0, and busy while the commit runs. After a commit that works, the handle stays at the end with its spinner until the drawer has closed. After a commit that fails, the handle goes back to the start, and the control reads **Try again**.
  - A commit that works closes the review and removes the added scans. The chip is empty, unless it shows a scan that was not recognized, and the Collection tab shows the cards the next time it opens.
  - A commit that fails shows the failure notice "Could not add to your collection. Your scans are kept." above the control, and the control reads **Try again** until a commit works. Each scan has its own copy ID, so the server never adds the same copy twice, even when the scan batch changed after the failure.
  - When the app restarts after a commit that failed or was still running, it sends the commit again by itself.
  - While the commit runs, rows do not open.
  - The phone saves the scan batch for each account, so they survive a restart. Another account on the phone does not see them.
- **Binder tile.** One copy's card image with a meta line and a price line under it. There is no quantity badge and no chip.
  - Until the image loads, the tile is a line-colored card shape.
  - The meta line sits 4 px below the card image, centered, in meta text in text muted: the set's expansion symbol from Scryfall at 16 px tinted with the rarity color of the card printing (see Colors), then the collector number. When the card catalog has no symbol for the set, or it has not loaded, the set code in capitals takes its place. A copy that is not NM adds a text dim " · " and its condition: "[symbol] 136 · MP". Every condition uses the same text muted color.
  - The line never names the finish. A foil copy has a faint rainbow sheen over its card image, and an etched copy has a faint silver sheen. Nonfoil copies have none. The sheen does not move. It is a diagonal gradient at 30% opacity, so the card art reads normally.
  - The price line sits 4 px below the meta line, centered, in price type (12 px, semibold) in text price, slightly brighter than the meta line. It shows the copy's current price in full, such as "$1,635.37". The price is the current Scryfall price for the card printing and finish. Condition and language do not change it. The currency is USD for now.
  - A copy with no price for its card printing and finish shows a text dim "–". A price is never taken from another finish or card printing.
  - A stale price, older than 24 hours, has a small 11 px `clock` symbol in text price before it. The symbol is neutral, not a warning.
  - VoiceOver reads the tile as one image: the name, the set code in capitals and the collector number, then the finish when it is not nonfoil and the condition when it is not NM, in words, then the price or "no price": "Bloomvine Regent // Claim Territory, TDM 136, foil, moderately played, $1,635.37". A stale price adds the hint "The price may be out of date."
  - Tiles open nothing yet. The card page and the badges for decks, planned swaps, and protected copies come later.
- **Commander gallery card.** Full-width commander art with a dark gradient, the deck name in card-title type, status chips, and a Needs you badge.

## Do's and Don'ts

- **Do** style new UI with NativeWind classes named after the tokens.
- **Don't** add inline style objects to new UI, or a value outside the tokens without a reason in this file.
- **Do** show the most likely printing after every scan, and keep the other options one tap away.
- **Do** list "Needs you" items oldest first, so the longest wait is on top.
- **Do** keep every deck change a user action, and show the AI's reason with every deck suggestion.
- **Do** rely on the phone's back gesture for pushed screens.
- **Do** flag validity problems ("would make this deck invalid") without blocking the action.
- **Don't** show recognizer confidence, similarity scores, or "unsure" states.
- **Don't** add on-screen back buttons, except the native one on a screen pushed inside a drawer, or "Find in decks" style shortcuts that duplicate visible deck tags.
- **Don't** mark suggested-out or buylist-out cards on the deck's Cards tab. Only planned swaps are commitments.
- **Don't** use the primary lime for decoration. It always means "you can act here" or "selected". The brand mark is the one exception.
- **Don't** draw anything over the camera except the card outline, the batch button, the latest-scan chip, and the pull indicator.
- **Do** keep Liquid Glass to the controls that float over the camera, and keep the dark surface fallback.
- **Don't** stack drawers or modals. One level only: push a screen inside the drawer instead (see Sheets).
