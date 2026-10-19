---
version: alpha
name: mtgscan
description: Dark, card-first phone app for scanning Magic cards, keeping a collection, and building Commander decks with an AI that plans swaps.
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
  mana-generic: "#beb9b2"
  mana-white: "#f0f2c0"
  mana-blue: "#b5cde3"
  mana-black: "#aca29a"
  mana-red: "#db8664"
  mana-green: "#93b483"
  mana-glyph: "#111111"
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
  mana-symbol:
    fontFamily: Mana
    fontSize: 9px
  mana-symbol-split:
    fontFamily: Mana
    fontSize: 5px
  mana-symbol-bare:
    fontFamily: Mana
    fontSize: 12px
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
  floating-button:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    width: 48px
    height: 48px
  floating-button-active:
    textColor: "{colors.primary}"
  commander-gallery-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 12px
    height: 140px
  deck-banner:
    backgroundColor: "{colors.surface}"
    padding: 16px
    height: 200px
  deck-tag:
    backgroundColor: "{colors.surface-control}"
    textColor: "{colors.text}"
    typography: "{typography.chip}"
    rounded: "{rounded.full}"
    height: 24px
  commander-avatar:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.full}"
    width: 40px
    height: 40px
  banner-commander-avatar:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.full}"
    width: 48px
    height: 48px
  deck-tag-avatar:
    rounded: "{rounded.full}"
    width: 18px
    height: 18px
  swipe-to-confirm-handle:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    height: 44px
  mana-symbol:
    backgroundColor: "{colors.mana-generic}"
    textColor: "{colors.mana-glyph}"
    typography: "{typography.mana-symbol}"
    rounded: "{rounded.full}"
    width: 12px
    height: 12px
  mana-symbol-split:
    typography: "{typography.mana-symbol-split}"
---

# mtgscan design

## Overview

mtgscan is an iPhone app for Commander players. Anyone can sign up, and each user's data is private to that user. It scans Magic cards one at a time, keeps the collection, and turns the AI's planned swaps and buylist cards into deck changes that the user makes. The interface is dark and card-first. Real card images carry the color, and the chrome stays quiet around them.

Three ideas shape every screen:

- **The card is the hero.** Card images are large and recognizable. Text supports the image and never replaces it.
- **The user decides.** A deck is the cards in the deck box now. The AI writes only planned swaps and buylist cards. Every deck change is the user's action. Nothing changes a deck without a tap.
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
- **Incoming (#d8ff62)** and **outgoing (#ff8a7a)** mark the plus and minus lines of a planned swap, buylist card, or deck change.
- **Warning (#f4d06f)** marks protected copies and caution states. **Danger (#ff7a70)** marks invalid decks, the cards that break a Commander rule, and destructive actions such as remove scan or revert. **Info (#8fd3ff)** marks the estimated bracket and in-deck counts.
- **Badge (#e0244a)** is only for count badges on tabs, buttons, and the basic land tiles of Collection, such as Needs you.
- **Card outline (#ff4fd8)** is the magenta line the scanner draws around a detected card. Nothing else uses it.
- **Camera off (#000000).** The Scan tab is pure black until the camera feed replaces it.
- **Rarity colors** tint the set symbol on binder tiles by the card printing's rarity. They follow Magic's own rarity colors, made flat and lighter for the dark UI: **rarity common (#e6e8e9)** light grey, **rarity uncommon (#a7bccb)** silver, **rarity rare (#e2bd5a)** gold, **rarity mythic (#f26a35)** orange-red, and **rarity special (#b48ef0)** purple for special and bonus. This is the one use of color on set symbols. Elsewhere, such as the quick-action bar, set symbols use the text color. A rarity the app does not know falls back to the text color.
- **Mana colors** fill the circle behind a mana symbol, after the Mana font's cost style: **mana generic (#beb9b2)** for generic and colorless mana, tap, and snow, **mana white (#f0f2c0)**, **mana blue (#b5cde3)**, **mana black (#aca29a)**, **mana red (#db8664)**, and **mana green (#93b483)**. The glyph on the circle is **mana glyph (#111111)**. Untap is the other way round: a white glyph on a mana glyph circle. Nothing else uses these colors. See Card symbols.

## Typography

The app uses the iOS system font, SF Pro, at a few weights.

- **Large title** (28 px, heavy) names top-level tabs: Recent, Collection, Decks.
- **Sign-in title** (24 px, heavy) is the one line on the sign-in sheet. **Brand** (22 px, heavy) sets the mtgscan name next to the brand mark.
- **Card title** (20 px, heavy) names a card on the copy page, and a deck in the deck header and the commander gallery.
- **Sheet title** (17 px, heavy) titles page sheets.
- **Body** (14 px) carries reasons, rules text, and list content. **Body strong** labels buttons and card names in rows. **Field** (14 px) is the text in a text field, such as the card name in name search. It has no fixed line height, so iOS centers the text in the field.
- **Meta** (12 px, muted) carries set and collector number, finish, condition, language, and timestamps.
- **Price** (12 px, semibold, text price) carries the current price under a binder tile and on a batch review row. On the latest-scan chip, it takes the meta line's color.
- **Chip** (11 px, bold) labels chips and status pills. **Tab label** (10 px, bold) sits under tab bar icons. **Credit** (10 px, semibold, dim) credits image and price sources such as Scryfall, and carries the Fan Content notice.
- **Mana symbol** (9 px) is the one type style in another font: the Mana font, which the app bundles. It draws the glyph of a card symbol on its 12 px circle, inline with body text. **Mana symbol split** (5 px) draws the two small glyphs of a hybrid symbol. **Mana symbol bare** (12 px) draws a symbol with no circle, such as {E}, at the size of a circle. See Card symbols.

Copy is plain sentence case and uses glossary terms exactly: planned swap, buylist card, free copy, protected copy, estimated bracket.

## Layout

The app is built for an iPhone in portrait. The page inset is 16 px, cards sit 12 px from the edges, and rows use 8 px gaps. The content of a tab ends 32 px above the tab bar. A list under floating buttons ends 80 px above the tab bar instead, or 80 px above the bottom safe area on a pushed screen (`sizes.floatingButtonClearance`), so the last row clears the buttons. The Collection grid and a deck's Cards tab have floating buttons.

Text follows the text size that the user sets in iOS. Buttons, chips, deck tags, and count badges grow taller with their labels, so a label never clips. Sign-in buttons and round icon buttons keep their height. The labels of a segmented control shrink to fit on one line. The commander gallery card and the deck banner grow taller when the deck name and chips need more room. The banner keeps them at least 60 px below the safe area (`sizes.headerClearance`): the 44 px header with Close and •••, and 16 px under it.

### App shell

A bottom tab bar holds four tabs, in this order: **Recent, Collection, Decks, Scan**. Recent has a count badge with the number of open planned swaps and open buylist cards across all decks. With none, it has no badge. The badge shows 1.5 seconds after the tab bar appears, at launch and after sign-in. On iOS 26, a badge set while the tab bar first lays out cuts the other tab labels short, such as "Collect…". The count reads again when the app comes back to the foreground and each time Recent or a deck screen reads its items.

A read that runs again, when a page gains focus or after a change, and fails, keeps what the page already shows. Only a page that has shown nothing yet shows its error state.

- **Recent** is the home across all decks. It holds only the Needs you items, **oldest first**: planned swaps ready to swap in and open buylist cards (owner decision, spec 4). Deck changes stay in each deck's History tab. Collection changes do not appear in Recent.
  - Each item carries a tag with the commander avatar and deck name. The tag opens that deck on Planned.
  - Filter chips: All, Planned swaps, Buylist. They hide while Recent is empty.
  - With no Needs you items, Recent shows its empty state. See Empty states.
  - Every item keeps its actions inline: Swap in, Bought, and Close.
  - The filter chips sit above the items. All is selected when Recent opens. Planned swaps shows only planned swaps, and Buylist only buylist cards.
  - A planned swap item shows its deck tag, then its change lines. The incoming line's meta is the copy's set code in capitals and collector number, then its finish when it is not nonfoil and its condition when it is not NM, such as "M10 146 · Foil · LP", so the user can find the held copy. A planned swap that makes the copy a commander adds "Commander". The outgoing line's meta is the outgoing copy's printing the same way. A basic land line shows the basic land and the count change, "+1" or "−1", as on History. When the swap would break a new rule, the effect chip follows, as on the revert page sheet. The reason follows in body text, with the AI client name and the time in meta text, such as "ChatGPT · 16 October 2026 at 18:05". A primary **Swap in** button and a secondary **Close** button end the item, side by side.
  - **Swap in** acts at once, with no confirmation, the same as **Remove from deck**, because the user can revert it. The item then leaves Recent. When the write fails, a native alert says "Could not swap in this card" and "Check your connection.", and the item stays. When the deck already has two other commanders, the alert says "Could not swap in this card" and "A deck has at most two commanders.". An item that changed elsewhere reloads Recent instead of acting.
  - **Close** closes the planned swap at once, with no confirmation, and frees its held copy. No deck changes, so there is nothing to revert. The item then leaves Recent. When the write fails, a native alert says "Could not close this planned swap" and "Check your connection.", and the item stays. An item that changed elsewhere reloads Recent instead of acting.
  - A buylist card item shows its deck tag, then its change lines. The incoming line shows the card's default Scryfall printing, and its meta is the card's type line, with "Commander" after it when the buylist card makes the card a commander. The outgoing line, a copy or a basic land, is the same as on a planned swap. The effect chip, the reason, and the meta follow, as on a planned swap. A primary **Bought** button and a secondary **Close** button end the item, side by side.
  - **Bought** opens the Bought page sheet. See Sheets.
  - **Close** on a buylist card closes it at once, with no confirmation. The item then leaves Recent. When the write fails, a native alert says "Could not close this buylist card" and "Check your connection.", and the item stays. An item that changed elsewhere reloads Recent instead of acting.
  - Recent reloads when the tab gains focus. When the first read fails, Recent shows its read failure state. See Empty states.
  - While the Recent read loads, a skeleton of two Needs you items shows in their place. It has the shape of the two ghost Needs you items. See Empty states. VoiceOver reads the skeleton as one element, "Loading Recent". When the read returns, the items, the empty state, or the read failure state replace it. A reload when the tab gains focus keeps the items already shown and brings no skeleton back.
- **Collection** is a binder grid with the collection total in its header.
  - The header has the collection total button next to the settings button (owner decision, #125). See Collection header.
  - Card images sit 3 per row, with **one tile per copy** and no quantity badge. Three copies of a card printing make three tiles (owner decision, #116).
  - Copies of the same card printing sit next to each other. By default, the card printing with the newest addition comes first. More tiles load as the user scrolls. The tab reloads when it gains focus.
  - While the binder grid loads and shows no tiles yet, a skeleton grid fills the visible screen in its place. It has the shape of the grid: three tiles per row, with the same gaps. Each tile is a card-shaped block over two short bars for the meta line and the price line, 12 px tall and 60% and 40% wide. The blocks are line-colored on the background and pulse like the skeleton chip. VoiceOver reads the skeleton grid as one element, "Loading collection". When the read returns, the tiles, the empty state, or the error state replace it.
  - A reload when the tab gains focus and a new page keep the tiles already shown and bring no skeleton grid back. The reload reads as many tiles as the tab showed, so the scroll position stays.
  - With no copies, the tab shows its empty state with a **Scan cards** button, which opens the Scan tab. See Empty states.
  - When the read fails, the tab shows the empty state "Could not load your collection" with a **Try again** button, which reloads the binder grid.
  - One quiet meta line under each card shows its deck's commander in a small circle when the copy is in a deck, a warning shield when the copy is protected, the set icon in its rarity color, the collector number, and the condition when it is not NM. Foil and etched copies carry a sheen on the card image instead of a finish label. A copy held by a planned swap starts the line with the held symbol.
  - A price line under the meta line shows the copy's current price (owner decision, #120). A copy with no current price shows "–". A stale price has a clock symbol.
  - Tapping a tile opens the copy page for that copy, from the binder and from search results alike.
  - **Basic lands.** Every collection has an unlimited supply of each basic land card (owner request, #356). Once the last page of copies has loaded, the twelve basic land cards follow the copies in a section of their own, under the header "Basic lands" in lime body strong, as on a deck's Cards tab. The header has no count. The tiles are in the order Plains, Island, Swamp, Mountain, Forest, Wastes, and the snow-covered version of each. They stay last whatever the sort. An empty collection shows its empty state and no basic land tiles.
  - A basic land tile is the basic land image with an ∞ count badge at its top right, and no meta line or price. VoiceOver reads it as a button, "Island, basic land, unlimited". Tapping it opens the Add to deck drawer for that basic land card (see Sheets).
  - Basic land tiles are not in the count line, the collection total, or its coverage.
  - A native search bar sits under the large title. See Collection search. Filters: All, Free, Allocated, Protected.
  - A round sort button floats over the grid at the bottom right and changes the order. See Collection search.
- **Decks** is a commander gallery: one commander gallery card per deck, the deck used most recently first. Decks used at the same time sort by name, ignoring case. See Components.
  - Opening a deck counts as using it. Later, changing its cards, renaming it, and changing its deck priority count too.
  - A tap on a gallery card opens the deck screen on Cards.
  - A **Create deck** bar button with the `plus` symbol sits before the settings button. It opens the native name alert "New deck" with "Name your deck.", a "Deck name" field, **Cancel**, and **Create**. The name takes at most 64 characters. **Create** is off while the trimmed name is empty. **Create** makes an empty deck at medium priority and opens it on Cards. **Cancel** creates nothing. Two decks can have the same name.
  - When the create fails, a native alert says "Could not create this deck" and "Check your connection.", and nothing opens.
  - With no decks, Decks shows its empty state with a **Create deck** button, which opens the same name alert. See Empty states.
  - When the first read fails, the tab shows the empty state "Could not load your decks" with a **Try again** button, which reads the decks again.
  - While the decks read loads, three commander gallery card skeletons show in place of the commander gallery. Each has the frame of a commander gallery card and the bars of the ghost commander card. See Empty states. VoiceOver reads the skeletons as one element, "Loading decks". When the read returns, the gallery cards, the empty state, or the error state replace them.
- **Scan** is a black screen that the camera feed replaces. The batch button sits top right, and the latest-scan chip sits at the bottom.
  - Until the gallery is on the phone, the camera stays off and the tab shows the gallery download:
    - "Downloading gallery" with a progress bar and the megabytes done of the total, such as "12.3 MB of 68.5 MB".
    - Under "Downloading gallery" and "Waiting for Wi-Fi", a line in text muted says "The scanner needs the gallery to recognize cards. It downloads once. Updates come in the background."
    - "Waiting for Wi-Fi" with the progress bar and a **Download now** button. The gallery downloads only on Wi-Fi until the user taps **Download now**, which uses mobile data.
    - "Gallery download paused. It continues when you are online." with a **Try again** button, when the phone is offline.
    - "Gallery download did not work." with a **Try again** button, when a part fails its SHA-256 check three times or the download is refused.
    - "Not enough space for the gallery. It needs 269.4 MB." with a **Try again** button. The number is the space that this download and install need.
  - A gallery update downloads in the background. Scanning goes on with the installed gallery, and the app switches to the new one when it is installed.
  - The first time the user opens Scan with the gallery on the phone, iOS asks for camera access.
  - When camera access is off, the tab shows its empty state with an **Open Settings** button, which opens the app's page in iOS Settings. See Empty states.
  - On a device without a camera, such as the Simulator, the tab shows the empty state "Camera not available".
  - The magenta card outline draws only around a detected card.
  - After three failed photos in a row or a camera error, the camera stops. The tab shows "Camera stopped." with a **Try again** button.
  - The camera stops when the user leaves Scan or the app.
  - The screen stays on while Scan is open. Batch review, the scan details, and the printing, condition, and language pickers opened from Scan keep it on too. Another tab, another screen over Scan, or the app in the background lets the phone auto-lock as usual.
  - Pulling down on the Scan tab adds the scan batch to the collection without opening batch review (owner decision, #130). It works in every Scan tab state, also over "Camera not available".
    - While the finger moves down, the pull indicator slides down from under the top of the screen. It says "Pull to add 3 cards". The number is the batch button's count.
    - At 120 pt the indicator reaches its place, 8 px below the safe area, and says "Release to add 3 cards". The phone plays a light impact haptic as the pull crosses 120 pt.
    - Releasing past 120 pt adds the scan batch with the same commit as **Add to collection**. The indicator says "Adding 3 cards" with a spinner until the commit ends. A commit that works clears the batch button's badge and leaves the chip empty, as after **Add to collection**. A scan that was not recognized stays on the chip. The indicator then slides away.
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
- The header buttons are native bar buttons in the text color. A tab can put more header actions before the settings button, as Collection does with the Filters and collection total buttons, and Decks does with the **Create deck** button.
- On iOS 26, the bar buttons are Liquid Glass. Content that scrolls under the bar blurs and fades behind it with the system scroll edge effect. There is no line under the bar.
- On iOS 18 and earlier, the bar is the standard iOS navigation bar, with no Liquid Glass.

### Collection header

The collection total is always visible. The owner picked variant C of the HTML prototype (`prototypes/collection-copies/index.html` on `prototype/first-release`, commit bbe3f0f).

- **Collection total button.** A native bar button between the Filters button (see Collection search) and the settings button. It shows the collection total in full, such as "$2,419.59".
- The total is the sum of every copy's current price for its card printing and finish. Copies with no current price are left out and counted in the coverage, so a missing price never silently lowers the total. It is in the currency of the settings drawer. A converted total shows no "≈" and no currency letters, such as "$3,686.00" in AUD. The menu title, the price credit, says that it is converted.
- With no collection entries, or before the total loads, the header shows no total button.
- **Menu.** Tapping the button opens a native menu under the button. A tap outside closes it. It holds:
  - the price credit as the menu title: "Current prices from Scryfall, in USD" for USD, or "TCGplayer Market price via Scryfall, converted from USD at the ECB rate for 12 Oct" for a converted currency, with the date of the exchange rate;
  - the coverage, such as "26 of 27 cards", with the subtitle "Priced";
  - only when the prices are stale, the day of the price snapshot, such as "12 October", with the `clock` symbol and the subtitle "Prices from".
- Prices are stale when they are more than 24 hours old, or when the exchange rate of a converted currency is stale.
- Every amount in the app shows the narrow symbol of its currency with no country letters, such as "$" for USD and AUD, "€", "£", or "¥". A symbol that ends in a letter, such as "kr" or "CHF", has a space before the number: "kr 120.00". Only the settings Currency row and the currency list name the currency. The app converts USD prices on the phone, so changing the currency switches every price at once without a new read.
- The button shows no stale clock. A native bar button with a symbol and a label shows only the symbol, so the stale state lives in the menu and the VoiceOver hint (owner decision, #190).
- The rows show information. They are disabled menu items, so a tap on them does nothing, and iOS shows them dimmed.
- The menu has no change since yesterday. mtgscan keeps no price history (`docs/adr/0004-keep-only-current-prices.md`).
- **VoiceOver.** The button reads "Collection total, $2,419.59" with the hint "26 of 27 cards priced". When the prices are stale, the hint adds "The prices may be out of date." A converted total adds "about": "Collection total, about $3,686.00".

### Collection search

The owner picked layout B of the HTML prototype (`prototypes/collection-management/collection-tab.html` on `prototype/collection-management`, commit 84a51cb).

- **Search bar.** The native iOS search bar sits under the large title, with the placeholder "Search your collection". It stays visible when the grid scrolls. Its caret and Cancel are primary lime.
- Typed text matches card names, type lines, and Oracle text, in the collection only. A word that starts with a known key, such as `set:m`, is not sent as text.
- **Suggestions.** While the user types, suggestions replace the grid. Each suggestion is a list row.
  - With no key typed, they offer the keys that start with the typed word, such as "set:" with "Set code".
  - After a key, they offer values: set codes from the card catalog with the set name, Oracle tags from the tag lookup with the tag label, and the fixed lists for finish, condition, language, rarity, and color.
  - After `user_tag:`, they offer the user's user tags whose names contain the typed text, ignoring case. Each shows its copy count, such as "3 copies".
  - After `deck:` or `-deck:`, they offer the user's decks whose names contain the typed text, ignoring case. Each shows its commander avatar, or a dashed circle, and its card count, such as "62 cards". Picking one makes a chip for that one deck, shown as `deck:"Atraxa"`, even when another deck has the same name.
  - Tapping a key puts it in the search bar. Tapping a value makes a chip. Enter closes the suggestions and shows the results.
- **Chips.** A space, Enter, or a picked suggestion turns `key:value` text into a chip.
  - The keys are `name`, `type`, `color`, `identity`, `mv`, `pow`, `tou`, `price` (with `=`, `<`, `<=`, `>`, `>=`), `tag`, `keyword`, `set`, `rarity`, `finish`, `condition`, `lang`, `user_tag`, `deck`, `is:commander`, `is:gamechanger`, `is:free`, `is:allocated`, and `is:protected`.
  - A value with spaces is quoted, as in `name:"sol ring"` or `user_tag:"trade binder"`. A `deck:` value is always quoted. A leading `-` negates, as in `-rarity:common`. The number keys and `identity` cannot be negated, because collection search has no exclude field for them.
  - A key that the app does not know stays as text.
- The app turns the text and the chips into the typed collection search query. The server never parses a string.
- The app sends deck IDs, and the server never matches deck names. A typed `deck:` chip, made without a pick, matches every deck with exactly that name, ignoring case.
- Chips sit under the search bar, at the top of the grid. Each chip shows its `key:value` text and ×. Tapping a chip removes it. Backspace in an empty field removes the last chip. Cancel clears the text and the chips.
- **Results.** Results show as binder tiles, one per copy. While text or a chip is active, a count line in meta text, such as "6 of 27 copies", sits above the grid. While a new search loads, the skeleton grid replaces the tiles. Basic land cards whose names contain every word of the text and every `name:` chip, ignoring case, follow the copies in the Basic lands section, so "island" ends with Island and Snow-Covered Island. With no matching copies, they are the only results. Any other chip or filter, such as `set:` or Allocated, hides every basic land tile. With no results, the grid shows the empty state "No cards found". See Empty states.
- Opening a copy page from the results puts the keyboard away. So does dragging the results. Back on the Collection tab, the text and the chips stay. The keyboard comes back only when the user taps the search bar.
- A chip that the server refuses, such as an unknown set, Oracle tag, or user tag, turns danger. The grid shows "No set named "zzz".", "No Oracle tag named "zzz".", "No keyword named "zzz".", or "No user tag named "signd".". A typed `deck:` chip that matches no deck turns danger in the same way, with "No deck named "atraxa".". Any other refused chip shows "mv>25 is not a valid chip."
- VoiceOver reads a chip as a button with its `key:value` text and the hint "Removes this chip."
- **Filters button.** A native bar button with the `line.3.horizontal.decrease` symbol sits before the collection total button, in every Collection state. A count badge in the badge color counts the active filters, typed or chosen in the Filters drawer. Each chip is one filter, except that the two chips of Free count as one. With no filter, it shows no badge. VoiceOver reads "Filters", or "Filters, 3" with three filters.
- **Filters drawer.** The Filters button opens a half-height drawer titled "Filters". It holds only chips and opens nothing else, so it stays one level deep. Its sections are:
  - **Show**: All, Free, Allocated, and Protected. Free is the `is:free` and `-is:protected` chips, so it sends `is_free: true` with `is_protected: false`. Allocated is the `is:allocated` chip, so it sends `is_allocated: true`. Protected is the `is:protected` chip.
  - **With user tags** and **Without user tags**: one chip per user tag. Each puts a `user_tag:` or `-user_tag:` chip on or takes it off. A user tag chosen in one section leaves the other, so it never matches nothing. The two sections show only when the user has user tags.
  - **Finish**, **Condition**, and **Language**: Any, then one choice each. Finish offers Nonfoil, Foil, and Etched. Condition offers NM, LP, MP, HP, and DMG. Language offers the language names. A choice replaces the chips of its key, and Any removes them.
- The drawer and the chips are one state. A drawer choice adds its chips under the search bar. A typed chip selects its choice in the drawer, so `finish:foil` selects Foil. A section whose chips match none of its choices, such as two typed finish chips, shows no choice selected.
- The collection searches again when the Filters drawer closes, not on each tap in it.
- **Sort button.** A round Liquid Glass button, 48 px across, floats over the grid at the bottom right, 16 px above the tab bar. It shows the `arrow.up.arrow.down` symbol at 18 px. Without Liquid Glass, it uses the control surface. It reacts to touch.
  - It opens a native menu titled "Sort by": Relevance, Recently added, Name, Price, Mana value, and Release date. The current sort has a check mark.
  - Tapping the current sort again reverses it. An arrow beside it shows the direction: `arrow.down` for high to low, Z to A, and newest first, and `arrow.up` for the other way. Price starts high to low, Name A to Z, Mana value low to high, and Recently added and Release date newest first. Relevance has one direction.
  - The sort applies to the binder and to search results. Relevance without text lists the newest addition first.
  - The symbol is in the text color while the sort is Relevance. Any other sort turns it primary lime. There is no badge or dot, because count badges are only for counts.
  - VoiceOver reads "Sort, Relevance", or the sort and its direction, such as "Sort, Price, high to low".
  - The sort lasts until the app restarts and is not saved. The button hides while the user types in the search bar and while the Filters drawer is open. It also hides while the tab shows an empty state, because there is nothing to sort.

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
- **Test sign-in.** A development build against local Supabase with `EXPO_PUBLIC_TEST_SIGN_IN` on shows a third button, **Sign in as the test user**, under **Continue with Google**. The test app shows **Sign in as the test user** as its only sign-in button, with no Apple or Google button. The button uses the control surface and the sign-in button height, and it signs in, fails, and dims like the other sign-in buttons. Other production builds leave it out.

### Consent page

The consent page is on the website at `mtgscan.reilley.dev/oauth/consent`, not in the app. An AI client sends the user there to sign in and allow or deny it. It is plain HTML and CSS in `apps/site`, with the site's colors and the system font. It has the site header with the brand, and one column of content up to 28 rem wide.

- **Expired link.** A missing `authorization_id`, or one that Supabase cannot find or that is no longer pending, shows "This link has expired. Start again from your AI chat." in text muted, with no buttons.
- **Signed out.** The title "Sign in to mtgscan" in sign-in title type, the line "Use the same sign-in as in the app" in text muted, and the sign-in buttons in one column with 8 px gaps: **Continue with Apple** first, then **Continue with Google**. Both are 50 px tall and full width, with 16 px medium type. **Continue with Apple** uses Apple's white style: a white fill, black text, the black Apple logo, and 8 px corners. A web page has no system Apple button, so the page draws it. Apple's branding rules set these colors, so they sit outside the palette. **Continue with Google** is the app's Google button, with the Google colors and logo. A sign-in that cannot start shows "Could not start the sign-in. Try again." in danger under the buttons.
- **Signed in.** From top to bottom:
  - an account card on surface: "Signed in with Apple" or "Signed in with Google" in body strong, the account email in text muted at meta size, "Use the same sign-in as in the app", and **Switch account** as a secondary button. **Switch account** signs out of this browser only and shows the sign-in buttons;
  - the AI client's name as the title, in sign-in title type, and "Returns you to chatgpt.com" in text muted. The host comes from the AI client's redirect URI, never from its name;
  - a card on surface with "Read your cards, collection, decks, and deck history. Plan swaps and add to your buylist. It cannot change your decks or collection.";
  - **Allow** as the primary button and **Deny** as a secondary button, side by side. After a tap, both dim to 38% while the page waits for Supabase.
- **Could not reach mtgscan.** When Supabase cannot be reached, the account card stays with **Switch account**. Below it, a card on surface says "Could not reach mtgscan." and has a primary **Try again** button that repeats the step.
- **Rejected session.** When Supabase rejects the session, the page signs out of this browser and shows the signed-out view.
- **Allow** and **Deny** go back to the AI client. Deny sends it `access_denied`.

### Problem pages

Each problem type of the MCP connection has a short page on the website at `mtgscan.reilley.dev/problems/<name>`, such as `/problems/stale-revision`. An AI client gets the URL as the problem's `type`. The pages use the site's `styles.css`: the site header and footer, one column up to 44 rem wide, and no script.

- The title is the problem's title, such as "Stale revision", in the site's h1.
- A meta line in text muted names the problem type URL in the system monospace font.
- "What it means" and "What to do next" follow as lime section headings, each with one or two short paragraphs. Tool names and argument names, such as `get_deck` and `expected_deck_revision`, are in the monospace font.

### Pushed screens

Pushed screens cover the whole screen, including the app tab bar. The user goes back with the phone's own gesture, which on iOS is the swipe from the left edge. A screen pushed inside a drawer, such as the scan details in batch review, also has the native back button (see Sheets).

On iOS 26, content that scrolls up under the status bar and the header buttons of the copy page, the deck screen, or the user tag picker blurs and fades behind them with the soft system scroll edge effect.

- **Copy page**, from a binder tile, shows that copy only (owner decision, spec 4). It is one scrolling page with no segmented control and no list of other copies or printings. Users never see the name "copy page": the page shows the card. From top to bottom:
  - the hero: the card image at 55% of the screen width, with the foil or etched sheen of the copy, over the art crop of the same card printing blurred. A double-faced card printing uses the art crop of its front face. A card printing with no art crop uses its card image blurred. While the art crop loads, the background color shows behind the card image;
  - the card name in card title type and the type line in text muted;
  - chips: **Protected** in warning with a shield symbol when the copy is protected, **Held** in info with the held symbol when a planned swap holds the copy, the set code in capitals, the collector number, the finish when it is not nonfoil, the condition, such as "NM", and the language, such as "English";
  - the deck line, with the deck tag of the deck the copy is in. A held copy shows the deck tag of its planned swap's deck instead. A tap opens the deck on Cards. A copy in no deck that no planned swap holds has no deck line;
  - **User tags**: one disclosure row with the copy's user tags as chips, or "Add user tags" in text muted when it has none, and a chevron. VoiceOver reads it as a button, such as "User tags, signed, trade binder". A tap pushes the user tag picker;
  - **Price**: value rows for "Current price" with the stale clock, "Added" with the day, such as "12 October 2026", "Purchase-day price", and "Since added", then the price credit, the same as in the collection total menu. A converted copy with no current price and no purchase-day price shows no credit. A converted price shows no "≈" and no currency letters, such as "$12.30" in AUD, because the credit under the prices says once that they are converted. VoiceOver hears "about" before a converted price. A missing price shows a text dim "–", and VoiceOver hears "no price". A stale current price adds the hint "The price may be out of date.";
  - "Since added" is the current price minus the purchase-day price, such as "+$3.20" or "−$3.20". The change is neutral, in price type in text price. The sign carries the direction: + or the minus sign. There is no green or red. No change shows "$0.00" with no sign. It uses the currency and the format of the two prices above it. A converted change shows no "≈", such as "+$4.68" in AUD. When either price is missing, the row shows a text dim "–". VoiceOver reads it as "Since added, up $3.20", "Since added, down $3.20", "Since added, up about $4.68", "Since added, no change", or "Since added, no price";
  - **Rules**: the Oracle text in a surface card, with each face's name over its text for a card with more than one face, then a "Commander" value row: "Legal", "Banned", "Not legal", or "Unknown". The card symbols in the Oracle text of every face, such as {G}, {T}, or {E}, show as card symbols. See Card symbols.
  - Section headings are lime body strong text.
  - A close bar button with the `xmark` symbol sits on the left of the header, over the hero (owner decision, #181). It is a native bar button in the text color, like the ••• button on the right. VoiceOver reads it as "Close". It goes back to where the copy page was opened from, the binder or the search results. The swipe from the left edge does the same. The search text, chips, sort, and scroll position stay as they were. It also shows while the copy loads and when the read fails.
  - A ••• bar button with the `ellipsis` symbol sits on the right of the header, over the hero. VoiceOver reads it as "More". It opens the actions menu, a native menu of what the user can do to this copy. Its first item is **Protect** for a free copy or **Unprotect** for a protected copy. **Add to deck** follows on a free or protected copy when the user has a deck. Its last item is **Delete copy**, in red. A copy in a deck has no Protect and no Add to deck, because copies never move straight from one deck to another. It has the commander item of the deck screen's long-press menu first, with the same rules and alerts, then **Remove from deck** before Delete copy. There is no Create deck item.
  - **Add to deck** opens the Add to deck drawer (see Sheets). On a protected copy, a native alert comes first: "This copy is protected." with "Putting it in a deck unprotects it.", **Unprotect and add**, and **Cancel**. **Unprotect and add** opens the drawer, and the add then unprotects the copy. **Cancel** opens nothing.
  - **Remove from deck** acts at once, with no confirmation. The deck tag goes, and the copy is free. When the write fails, a native alert says "Could not remove this card" and "Check your connection.", and the copy stays in its deck.
  - **Protect** and **Unprotect** act at once on this copy only, and the Protected chip changes. When the write fails, a native alert says "Could not protect this card" or "Could not unprotect this card" and "Check your connection.", and the copy stays as it was.
  - **Delete copy** shows a native alert "Delete this copy?" with "It leaves your collection with its user tags. This cannot be undone.", **Delete copy** in red, and **Cancel**. On a copy in a deck, the alert names the deck: "It leaves <deck name> and your collection, with its user tags. This cannot be undone." The delete then adds a "Removed from collection" deck change to that deck. On a held copy, the alert says "This copy is held by the planned swap for <deck name>. Continue and move that swap to the buylist?". The delete then moves that planned swap to the buylist. When a planned swap took the copy since the page loaded, the delete changes nothing, the page reloads with the Held chip, and the alert asks again with the held copy message. After the delete, the app goes back to the binder, which reloads without the tile. When the delete fails, a native alert says "Could not delete this copy" and "Check your connection.", and the page stays.
  - A copy that no longer exists, such as one deleted on another phone, shows a native alert "This card is no longer in your collection." with **OK**, which goes back to the binder. The same alert shows when the copy is gone by the time the user picks an action.
  - When the read fails, the page shows the empty state "Could not load this card" with a **Try again** button. See Empty states.
- **User tag picker**, from the User tags row of the copy page. It is a pushed screen, not a drawer:
  - A back bar button with the `chevron.left` symbol sits on the left of its navigation bar. It is a native bar button in the text color, like the copy page's close button. VoiceOver reads it as "Back". It goes back to the copy page. The swipe from the left edge does the same.
  - The title "User tags" in sheet title type, then a meta line that names the copy with its chip labels, such as "Angelic Curator · MH2 · 262 · Foil · LP · English".
  - A field, "Find or create a user tag", that takes at most 64 characters. A tap on a row acts at once, even while the keyboard is up.
  - When the trimmed text matches no user tag ignoring case, the first row reads "Create "<name>"" with "and add it to this copy" and a 22 px lime `plus`. A tap creates the user tag, puts it on the copy, and clears the field. Done on the keyboard does the same and puts the keyboard away.
  - Then one check row for each user tag whose name contains the text, ignoring case, sorted by name. The meta line has its copy count, such as "3 copies". A lime filled check mark shows when this copy has the user tag. A tap adds it to this copy or takes it off.
  - Each user tag row has a ••• button with the `ellipsis` symbol in text muted at its right end, inside the row. VoiceOver reads it as "More, <name>", such as "More, Signed". It opens a native menu with **Rename** and **Delete user tag**, in red.
  - **Rename** turns the row into a field with the name, which VoiceOver reads as "User tag name" and which takes at most 64 characters, and a lime **Save** button. Save is off while the trimmed name is empty. Save renames the user tag on every copy and turns the field back into the row. A name that matches another user tag ignoring case shows the failure notice "You already have a user tag named "<name>"." under the field, and the field stays.
  - **Delete user tag** shows an inline confirmation in a surface card under the row: "Delete "<name>"? It comes off N copies.", such as "It comes off 1 copy.", with **Delete user tag** in danger and **Cancel**. Delete user tag deletes the user tag and takes it off every copy. Cancel closes the confirmation.
  - With no user tags, it shows "No user tags yet. Type a name to create one." in text muted.
  - A change that fails shows the failure notice "Could not change the user tags. Check your connection."
  - When a read fails, the picker shows the empty state "Could not load your user tags" with a **Try again** button. See Empty states.
  - A copy that no longer exists goes back to the copy page, which says so.
- **Deck screen**, from the gallery or a deck tag. It is a pushed screen over the app tab bar, and it marks the deck used when it opens:
  - The banner runs edge to edge and starts at the top edge of the screen, under the status bar, like the copy page hero (owner request, #259). It has square corners. Below the safe area it is at least 200 px tall, and the header with Close and ••• floats over its top. The deck name in card title type and the chips sit at its bottom, 16 px from the sides and the bottom, so they stay clear of the status bar and the buttons. The banner shows no deck priority and no card count. The deck priority is in the ••• menu. The banner shows the art crop of the deck's first commander, the one made commander first, fading into the background (`gradients.commanderArtScrim`). A second commander shows as a 48 px commander avatar at the bottom right of the banner, beside the name and chips. A deck with no commander shows the ghost commander card edge to edge: a dashed line-colored outline on the surface color, with the name and chips at its bottom.
  - Once the banner scrolls under the header, the deck name becomes the header title, between Close and •••. It goes again when the banner scrolls back.
  - Once the deck has a card, the validity chip shows under the deck name. The chips wrap to a second line when they do not fit. The validity chip is a status chip button (see Components): "Valid" in the text color with a `checkmark`, "Invalid" in danger with a `nosign`, or "Cannot be determined" in warning with a `questionmark`. VoiceOver reads it as a button, such as "Deck validity, Invalid". It opens the Deck validity drawer (see Sheets). The bracket chip follows the validity chip. It is a status chip button with "Bracket 3" in info and no symbol. VoiceOver reads it as the button "Estimated bracket 3". It opens the Estimated bracket drawer (see Sheets). A stale chip adds the 11 px `clock` symbol after its label, in the same color. VoiceOver adds the hint "The rules data may be out of date." to a stale chip. The validity and the estimated bracket go stale on their own, as `README.md` (Deck evaluations, Freshness) says. An empty deck shows no chips. The validity chip and the bracket chip show with the first card, a commander, a main deck card, or a basic land, and hide again when the last card is removed.
  - A close bar button with the `xmark` symbol sits on the left of the header, over the banner, as on the copy page. VoiceOver reads it as "Close". It goes back to where the deck screen was opened from. The swipe from the left edge does the same.
  - A ••• bar button with the `ellipsis` symbol sits on the right of the header, over the banner. VoiceOver reads it as "More". It opens a native menu:
    - **Rename** opens the name alert "Rename deck" with "Name your deck.", the deck name in the field, and **Cancel** and **Save**.
    - **Priority** opens a submenu with **High**, **Medium**, and **Low**, with a check mark on the deck priority.
    - **Delete deck** is in red. It asks first with the alert "Delete <name>?".
    - The alert says "Its N cards become free, and its history is deleted. This cannot be undone.", such as "Its 1 card becomes free, …". N is the card count. A deck with no cards says only "Its history is deleted. This cannot be undone."
    - The alert has **Delete deck** in red and **Cancel**. Delete deck goes back to the gallery.
    - A write that fails shows a native alert with "Check your connection." and changes nothing. The titles are "Could not rename this deck", "Could not change the deck priority", and "Could not delete this deck".
    - A deck that was deleted elsewhere goes back to the gallery.
  - A segmented control under the banner switches between **Cards**, **Planned**, and **History**. The deck screen opens on Cards from Decks, Collection, and the copy page. It opens on Planned from the deck tag of a Recent item.
  - **Planned** has a count badge after its label with the number of the deck's open planned swaps and buylist cards, such as "Planned 2". With none, it has no badge. VoiceOver reads it as "Planned, 2".
  - **Cards** starts with a "Commander" group. With no commander, it shows "No commander yet." in text muted under the heading. An empty deck then shows the empty state "No cards yet". See Empty states. **Open Collection** closes the deck screen and opens the Collection tab.
  - **Cards** shows the deck cards as card images 3 per row, with the binder grid's gaps and corners. A tile has the finish sheen of its copy, and no meta line and no price. VoiceOver reads it as a button with the name, the set code in capitals and the collector number, and the finish and condition as on a binder tile, such as "Sol Ring, C21 263, foil". A tap opens the copy page.
  - A tile whose copy an open planned swap takes out shows "Planned out" under the card image, centered, in meta text in outgoing red. VoiceOver adds "planned out" to its label, such as "Sol Ring, C21 263, foil, planned out". A buylist card marks no tile, because only a planned swap holds a copy.
  - A tile whose copy is in a violation's cards has the danger outline, with no badge. Commander tiles get it too. VoiceOver adds "breaks a Commander rule" to its label, such as "Sol Ring, C21 263, foil, breaks a Commander rule". A card in an undetermined check gets no outline. See Components.
  - A long press on a card tile opens a native context menu with the card as its preview. It has **Open card**, then the commander item, then **Remove from deck** in red. The commander item is:
    - **Make commander** when the deck has no commander;
    - **Make partner** when the deck has one commander and this card is not it;
    - **Move to main deck** when this card is a commander;
    - nothing when the deck has two commanders and this card is not one.
  - The commander items act at once, with no confirmation. Each is a deck change. Any card can be made a commander. When the write fails, a native alert says "Could not make this card a commander" or "Could not move this card to the main deck" with "Check your connection.", and the deck stays as it was.
  - **Remove from deck** acts at once, with no confirmation, and the card leaves Cards. When the write fails, a native alert says "Could not remove this card" and "Check your connection.", and the card stays.
  - Commanders come first, in the Commander group, with the oldest commander first. The main deck follows in groups. Each group header shows its name in lime body strong and its count in meta text, such as "Creatures 12". VoiceOver reads it as one header, "Creatures, 12". Empty groups are hidden.
  - The group button chooses the groups. The choices are:
    - **Type**, the default: Creatures, Planeswalkers, Battles, Artifacts, Enchantments, Instants, Sorceries, Lands. A card with several types goes into the first match in that order, so an artifact creature is in Creatures. A card with none of these types goes into the last group, Lands.
    - **Mana value**: 0, 1, 2, 3, 4, 5, 6, 7+, then Lands. Lands holds the cards that Type puts in Lands. A mana value with a half, such as 0.5, goes into the group of its whole number.
    - **Color**: White, Blue, Black, Red, Green, Multicolor, Colorless. A card with two or more colors is Multicolor, and a card with no color is Colorless.
    - **Rarity**: Mythic, Rare, Uncommon, Common, Special. Bonus cards are in Special.
    - **None**: one group, "Main deck".
  - The sort button sorts the cards inside each group. The choices are **Name**, the default, A to Z; **Mana value**, low to high; **Price**, high to low; and **Recently added**, the newest addition to the deck first. Price uses the current price, and cards with no current price come last in both directions. Cards with the same value sort by name, A to Z. The sort does not change the Commander group.
  - Tapping the current sort again reverses it, as on Collection.
  - The group and sort choices last until the app restarts and apply to every deck. They are not saved.
  - Two round floating menu buttons float at the bottom right, 16 px above the bottom safe area, while Cards shows deck cards. The sort button is at the right, where the Collection sort button is. The group button sits 8 px to its left. See Components.
  - Basic lands are main deck cards with no group of their own. Each basic land in the deck is its own tile: 8 Islands make 8 Island tiles. They group and sort like other cards: Lands under Type and Mana value, Colorless under Color, and Common under Rarity. Under Price they come last, as cards with no price do, and under Recently added they come last in both directions. A basic land tile is the basic land image, with no meta line. VoiceOver reads it as an image, "Island". A tap does nothing. A long press opens a native context menu with only **Remove from deck** in red, which takes one of that basic land out of the deck in one deck change. When the remove fails, the alert "Could not remove this card" with "Check your connection." shows. A basic land in a violation's cards, such as a Mountain outside the color identity, has the danger outline on each of its tiles, and VoiceOver reads "Mountain, breaks a Commander rule".
  - **Planned** lists the deck's open planned swaps and buylist cards, oldest first, as the Recent items without the deck tag. **Swap in**, **Bought**, and **Close** work as on Recent, with the same alerts. After a Swap in or a Bought, Cards and History show the new deck change. Planned reloads when the deck screen gains focus.
    - With two or more open planned swaps, a primary **Swap in all** button sits above the list. A tap shows the native alert "Swap in N cards?" with "Do this after you sleeve them.", **Swap in all**, and **Cancel**. **Swap in all** swaps in the open planned swaps that Planned shows, oldest first, each as its own "Swapped in" deck change. Buylist cards stay, because each one needs **Bought**. Planned and the Needs you counts then reload.
    - When the write fails, the alert says "Could not swap in all cards" and "Check your connection.", and nothing changes. When a card would make a third commander, the alert says "Could not swap in all cards" and "<card> would make a third commander. Nothing was swapped in.". A planned swap that changed elsewhere reloads Planned instead.
    - With none, Planned shows its empty state. See Empty states.
    - When the read fails, Planned shows the empty state "Could not load this deck" with a **Try again** button.
  - **History** lists the deck changes, newest first, one surface card each. More deck changes load as the user scrolls near the end, 20 at a time.
    - A card shows the kind in body strong: "Added", "Removed", "Made commander", "Made partner", "Moved to main deck", "Basic lands", "Removed from collection", "Revert", "Swapped in", or "Bought". A reverted deck change has a "Reverted" chip after its kind. The day and time follow in meta text, such as "16 October 2026 at 18:05". A **Revert** button in danger sits on the right of the card. It opens the revert page sheet. See Sheets. VoiceOver reads the kind, the chip, and the time as one element, such as "Added, Reverted, 16 October 2026 at 18:05", and the button on its own.
    - Change lines follow. See Components. A copy that comes into the deck is a green + row, and a copy that leaves is a red − row. The meta is the type line. A commander change shows the new place instead, "Commander" or "Main deck". A basic land line shows the count change, such as "+2" or "−2".
    - A "Swapped in" or "Bought" card shows the reason of its planned swap or buylist card in body text under its change lines, with the AI client name in meta text.
    - The list ends with the day the deck was created, such as "Created 15 October 2026", in meta text.
    - When the read fails, History shows the empty state "Could not load this deck" with a **Try again** button.
  - While the deck read loads, a skeleton of the deck screen shows under Close. It has the banner with the bars of the ghost commander card, a block in place of the segmented control, and, on Cards, a short bar for the first heading over a grid of card-shaped blocks that fills the visible screen, three per row with the binder grid's gaps. The tiles have no bars, because deck tiles have no meta line. The blocks pulse like the skeleton grid. VoiceOver reads the skeleton as one element, "Loading deck". When the read returns, the deck or the error state replaces it. A reload when the deck screen gains focus keeps the deck shown and brings no skeleton back.
  - When the read fails, the deck screen shows the empty state "Could not load this deck" with a **Try again** button. Close still shows.

### Sheets

Short tasks use iOS page sheets that close with a downward swipe or Done:

- Bought with the acquired copy picker;
- revert.

The Bought page sheet, from the **Bought** button of a buylist card on Recent or the Planned tab:

- Its native navigation bar has **Cancel** on the left and the title "Bought" in sheet title type.
- "Pick the copy you bought." in text muted sits above the rows. It hides when there is no free copy.
- One list row per free copy of the card, across printings: the card thumbnail of the copy's printing, the card name, and a meta line with the set code in capitals and the collector number, then the finish when it is not nonfoil and the condition when it is not NM, such as "SS1 4 · Foil · LP". VoiceOver reads the row as a button with the name and the meta line.
- A protected copy has a warning line under its row: "<card> is protected. Picking it unprotects it.".
- A tap on a row puts that copy into the deck as one deck change, unprotects a protected copy, closes the sheet, and the item leaves Recent or Planned.
- With no free copy, the sheet shows the empty state "No copies found" with "Scan copies into your collection first.". See Empty states.
- A write that fails shows the native alert "Could not mark this card bought" with "Check your connection.", and the sheet stays. When the deck already has two other commanders, the alert says "Could not mark this card bought" and "A deck has at most two commanders.".
- A copy that is no longer free reloads the sheet. A buylist card that changed elsewhere closes the sheet, and Recent or Planned reloads.
- When the free copies cannot load, the sheet shows the empty state "Could not load your copies" with a **Try again** button.

The revert page sheet, from the **Revert** button of a deck change on History:

- Its native navigation bar has **Cancel** on the left, the title "Revert" in sheet title type, and **Revert** in lime on the right.
- The text says what the revert undoes: "Undo "<kind>" and the N later changes in <deck name> as one new change.", such as "Undo "Added" and the 1 later change in Atraxa as one new change.". With no later change, it says "Undo "<kind>" as one new change.".
- When the revert would break a new rule, a small danger status chip follows: "Would make it invalid: color identity" when the deck is valid or cannot be determined, or "Adds a violation: singleton" when it is already invalid. It names the rules in the violation order, joined by commas. VoiceOver reads the full text, as on the Add to deck drawer row, such as "Would make Kinnan invalid: color identity, Red". Revert stays on.
- The change lines follow: a + line for each card that comes back and a − line for each card that goes out, as on History.
- Each block shows as a failure notice, such as "Cyclonic Rift is no longer in your collection." or "Sol Ring is in Kinnan.". Revert is off while a block shows.
- Each protected copy that comes back shows as a warning line: "<card> is protected. Reverting unprotects it.". Revert unprotects it.
- Each held copy that comes back shows as a warning line with the held symbol: "<card> is held by the planned swap for <deck name>. Reverting moves that swap to the buylist.". Revert stays on and moves that planned swap to the buylist.
- Revert makes one new deck change, closes the sheet, and History shows it. Cancel or a downward swipe closes the sheet and changes nothing.
- When the deck changed since the sheet loaded, Revert reloads the sheet, and History reloads when the sheet closes.
- A revert that fails shows the native alert "Could not revert this change" with "Check your connection.", and the sheet stays.
- When the revert preview cannot load, the sheet shows the empty state "Could not load this revert" with a **Try again** button, and Revert is off.

Settings, the scan details sheet, the printing picker, the condition and language pickers, the Filters drawer, the Add to deck drawer, the Deck validity drawer, the Estimated bracket drawer, and batch review are bottom drawers, not page sheets. The settings button on Recent, Collection, and Decks opens the settings drawer. The rules below hold for all of them.

- It slides up from the bottom with the iOS grabber.
- A drawer with a lot of content opens at full height and has no half height. These are the scan details sheet, the printing picker, and batch review.
- Settings, the condition and language pickers, the Filters drawer, the Add to deck drawer, the Deck validity drawer, the Estimated bracket drawer, and other short drawers open at half the screen height. Dragging one up takes it to full height. Dragging it down takes it back to half height.
- A downward swipe closes it. At half height, a tap outside closes it too. At full height, iOS leaves no screen outside it to tap. It has no Done button.
- Its content starts 32 px (spacing xl) below the top edge, twice the page inset, so that it clears the grabber. Under a native navigation bar, such as on batch review, the Bought and revert page sheets, and the currency and AI clients lists, the bar already clears the grabber, so the content starts 8 px below the bar. The content scrolls at every height.

**One level only.** Drawers and modals (page sheets, alerts, and confirmation sheets) stack one level at most: no drawer opens over a drawer, no modal over a modal, and no drawer over a modal. A modal may open over a drawer, such as the native alert for **Remove all scans** in batch review. When a task inside a drawer needs another step, such as editing a scan from batch review, it pushes a screen inside the same drawer with a back button and the swipe-back gesture. Native menus (for example the collection total menu) are not drawers or modals and may open from a drawer.

The Add to deck drawer, from the copy page's actions menu or a basic land tile on Collection:

- The title "Add to deck", then a meta line that names the copy with its chip labels, as in the user tag picker, such as "Angelic Curator · MH2 · 262 · Foil · LP · English". For a basic land, a stepper row takes the place of the meta line: the basic land thumbnail, its name, and a stepper from 1 to 99 that starts at 1. VoiceOver reads it as "Remove one Island", "Island, 1", and "Add one Island".
- One list row per deck, in the order of the Decks gallery. A row has the 40 px commander avatar, or a dashed circle with no commander, the deck name, and its deck priority and card count, such as "Medium priority · 62 cards". The avatar and the card count tell apart two decks with one name.
- The drawer reads `preview_add_deck_card` beside `list_decks`. When the add would break a new rule in a deck, its row shows a small danger status chip under its meta line: "Would make it invalid" when the deck is valid or cannot be determined, or "Adds a violation" when it is already invalid. VoiceOver adds the full text to the row, such as "Would make Kinnan invalid: color identity, Red" or "Adds a violation to Kinnan: singleton". Until the preview loads, or when it fails, rows show no effect chip and no error.
- A tap puts the copy in that deck's main deck, closes the drawer, and the copy page reloads with the deck tag. An effect chip never blocks the add.
- A copy that is no longer free closes the drawer and shows the native alert "This card is already in a deck.". The copy page reloads.
- A write that fails shows the native alert "Could not add this card" with "Check your connection.", and the drawer stays.
- A copy that no longer exists closes the drawer, and the copy page says so, as for its other actions.
- When the deck list cannot load, the drawer shows the empty state "Could not load your decks" with a **Try again** button. See Empty states.

- For a basic land, the effect chip judges each deck with that many more of the basic land. A tap adds that many to the deck in one deck change and closes the drawer. A count that would take the deck over 99 of that basic land shows the alert "Could not add these basic lands" with "A deck has up to 99 of each basic land.", and a write that fails shows the same title with "Check your connection.". The drawer stays after either alert.
- A deck that was deleted elsewhere closes the drawer and goes back to the gallery.
- When the deck cannot load, the drawer shows the empty state "Could not load this deck" with a **Try again** button.

The Deck validity drawer, from the validity chip in the deck screen header. The deck screen is a pushed screen, so this drawer is the only one open:

- The title "Deck validity", then the text "Checked against the current Commander rules." in meta text.
- "Chosen color: Blue (inferred)" when the deck has a chosen color.
- One rule row per violation, in the fixed violation order. A rule row is a surface card:
  - the rule name in danger body strong, such as "No commander", "Deck size", or "Color identity";
  - the citation as a lime text link at the right end of the first line, such as "CR 903.5a". It opens `https://magic.wizards.com/en/rules` in the browser. "Banned" and "Not legal" have no link;
  - the message in meta text, such as "87 of 100 cards.";
  - the cards as thumbnail chips, which are not buttons (see Components);
  - the hint in meta text, when there is one, such as "Add 13 cards.".
- One rule row per undetermined check, in warning, with the rule name, the reason in meta text, and its cards. It has no link and no hint. A legality check with no rules data has the rule name "Legality" and the reason "No rules data for Mine Security.".
- A valid deck shows "This deck follows the Commander rules." in place of the rows.
- The last line, in meta text: "Rules data as of 12 October 2026", with " · Stale" when the validity is stale. With no rules data time, the line is left out.
- The drawer reads from the deck read. It loads nothing more.
- When the deck cannot load, the drawer shows the empty state "Could not load this deck" with a **Try again** button.

The Estimated bracket drawer, from the bracket chip in the deck screen header. Like the Deck validity drawer, it is the only drawer open:

- The title "Estimated bracket 3", then the text "Each signal sets a lowest bracket. The highest one wins." in meta text.
- One bracket signal row per bracket signal, in the fixed signal order. A bracket signal row is a surface card:
  - the signal name and count in body strong, such as "Game Changers: 3", "Mass land denial: 1", "Two-card combos: 2", or "Extra turns: 4";
  - its lowest bracket in info at the right end of the first line, such as "Bracket 3";
  - its source in meta text, "official" or "heuristic";
  - its cards as thumbnail chips;
  - for two-card combos, one line per combo in meta text with its produced features and its bracket tag, such as "Infinite colorless mana (Commander Spellbook, ruthless)".
- "Could be Bracket 5 if built for the cEDH metagame." in meta text.
- "Commander Brackets are optional guidance for a pregame conversation." in meta text, then the lime text link "Commander Brackets on wizards.com". It opens `https://magic.wizards.com/en/formats/commander` in the browser.
- The last line, in meta text: "Rules data as of 12 October 2026", the day of the oldest rules data the estimate read. It adds " · Stale" when the estimated bracket is stale, then " · Signals missing for 2 cards" when cards have no Game Changer flag, and " · No Oracle tag data yet" or " · No combo data yet" when that data was never imported.
- The drawer reads from the deck read. It loads nothing more. When the deck cannot load, it shows the empty state "Could not load this deck" with a **Try again** button.

The settings drawer:

- The title "Settings" stays at the top at either height. The content below the title scrolls under it.
- It shows the signed-in account in a card, a gallery card, a Currency row, an AI clients row, a Scan sounds card, and **Sign out** below them. The account card shows the provider of the current sign-in and the account email. Apple and Google sign-ins with the same verified email share one account, so the provider can change between sign-ins.
- The gallery card shows "Gallery", the date of the installed gallery version, such as "12 October 2026", and "Up to date", "Downloading", or "Paused". "Paused" covers waiting for Wi-Fi, offline, a failed download, and too little space.
- The Scan sounds card has a "Scan sounds" switch with a lime track. It is on by default. Turning it off stops the scan sounds and keeps the scan haptics.
- The Currency row shows "Currency" and the currency code in text muted, such as "AUD", with a chevron. VoiceOver reads it as a button, "Currency, AUD". A tap pushes the currency list inside the drawer, with the back button "Settings".
- The currency list has the title "Currency". It lists the currencies that mtgscan has an exchange rate for, plus USD, in code order. Each row shows the code and the name, such as "AUD Australian dollar", with a check mark on the current currency. A tap chooses the currency and goes back to settings. Every price in the app then switches to it. When the list cannot load, it shows "Could not load the currencies" with **Try again**. Until the list loads, prices show in USD, and the app reads the list again when the user returns to the app.
- On first launch, the currency is the phone's region currency when the list offers it, otherwise USD. The phone keeps the choice, so it survives a restart and a sign-out. When the list no longer offers the chosen currency, prices show in USD with no message.
- The AI clients row sits under the Currency row. It shows "AI clients" and the number of connected AI clients in text muted, such as "1", with a chevron. VoiceOver reads it as a button, "AI clients, 1". While the AI clients load, or when they cannot load, the row shows no number. A tap pushes the AI clients list inside the drawer, with the back button "Settings".
- The AI clients list has the title "AI clients". Its first card shows "MCP server URL", the URL in meta text, such as "https://<project ref>.supabase.co/functions/v1/mcp", and a secondary **Copy** button on the right. Under them, meta text says: Add it as a custom connector in your AI chat. You will sign in to mtgscan and allow it. **Copy** puts the URL on the clipboard, and the button then reads **Copied** until the list closes.
- Under the card, each AI client has a surface card with its name, the day the user allowed it in meta text, such as "Allowed 16 October 2026", and a danger **Revoke** button on the right. VoiceOver reads the name and the day as one element, such as "ChatGPT, Allowed 16 October 2026", and the button on its own. With no AI clients, the list shows "No AI clients are connected." in text muted. When the list cannot load, it shows "Could not load the AI clients" with **Try again**. The URL card stays in every state.
- **Revoke** opens the alert "Revoke ChatGPT?" with "It loses access to your mtgscan data at once.", **Revoke** (destructive), and **Cancel**. **Revoke** ends the AI client's access. While it runs, the row's **Revoke** button shows a spinner and cannot be tapped. When it works, the row leaves the list at once, with no new read. When it fails, the alert "Could not revoke ChatGPT" says "Check your connection.", and the row stays.
- The cards, the Currency row, and the AI clients row fit at half height.
- Under **Sign out**, the Wizards Fan Content notice sits in credit type in text dim: "mtgscan is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC."
- The settings drawer shows no Scryfall price note. Scryfall's API guidelines do not require one. The price credit already names Scryfall.
- Only a development build shows a "Parity check" section under the Fan Content notice, with a **Run the parity check** button. After a check, the section lists "Gallery version 20261012-cf1753", "Lowest cosine 0.99976", "Mean cosine 1.00003", and "24 reference images", with the cosines to 5 decimals, then each reference image that failed. When the check cannot run, it shows "Could not run the parity check:" and the error code. Production builds leave it out.

## Elevation & Depth

The interface is flat. Depth comes from tone, not shadow.

- Content sits on surface tones that step up from the background: surface, surface raised, surface control.
- Page sheets slide over a dimmed, slightly scaled screen. The settings drawer slides over a dimmed screen that keeps its size. A soft shadow above the sheet is the only strong shadow. On the sign-in sheet it is black at 55%, 12 px up, with a 40 px blur. `theme.ts` names it `shadows.sheet`. The binder wall scrim on the sign-in screen is the background color at 90% at the top, 20% at 16% of the height, 25% at 45%, and 90% from 62% down. `theme.ts` names it `gradients.binderWallScrim`.
- The foil and etched sheens on binder tiles are diagonal gradients over the card image at 30% opacity (`opacity.sheen`). They sit outside the palette, like card art.
  - **Foil sheen** (`gradients.foilSheen`, 115 degrees): clear to 22%, then pink `rgba(255, 80, 170, 0.55)`, yellow `rgba(255, 230, 90, 0.5)`, mint `rgba(80, 255, 200, 0.5)`, blue `rgba(80, 150, 255, 0.55)`, and violet `rgba(200, 110, 255, 0.5)` from 34% to 66%, then clear from 78%.
  - **Etched sheen** (`gradients.etchedSheen`, 120 degrees): clear to 25%, then white `rgba(255, 255, 255, 0.55)`, silver `rgba(200, 210, 215, 0.25)`, and white again from 42% to 58%, then clear from 75%.
- The hero of the copy page blurs the art crop with a 26 px radius (`blurRadii.heroArt`) and shows it at 45% opacity over the background (`opacity.heroArt`), so the card stands out from its own art. The blur radius is an image prop, not a class.
- The empty state illustrations on the background fade downward into it (`gradients.emptyStateFade`). On a page sheet or a drawer, they fade into the sheet color instead (`gradients.emptyStateSheetFade`). See Empty states.
- Commander art on the commander gallery card and the deck screen banner fades down into the background color, clear to 30% of the height and 90% at the bottom (`gradients.commanderArtScrim`), so the deck name and chips stay readable.
- NativeWind 4 has no class for a box shadow or a gradient, so the shadows, the scrim, the sheens, and the empty state fade are style values.
- The tab bar is a near-opaque bar with a hairline top border.
- The controls that float over the camera or over scrolling content use Liquid Glass. See Liquid Glass.
- During a back swipe, the screen follows the finger with a shadow on its left edge.

### Liquid Glass

Liquid Glass is Apple's glass material from iOS 26 (owner decision, #113).

- Only the controls that float over the camera or over scrolling content use glass: the latest-scan chip, the quick-action bar, the batch button, the pull indicator (owner decisions, #113 and #130), the tab header buttons (owner decision, #128), the sort button on Collection (#143), and the group and sort buttons on the deck screen's Cards tab (#229). Every other surface stays flat.
- The tab header buttons are native bar buttons. iOS 26 draws their glass, so `GlassSurface` does not wrap them.
- The pull indicator does not react to touch. It moves by sliding, never by fading.
- The glass is the regular style with no tint. Glass that the user can tap, such as the chip, the quick-action bar, the batch button, and the group and sort buttons, reacts to touch. The skeleton chip and the basic land chip do not.
- The chip and the quick-action bar sit in one glass group with 8 px spacing, so they blend like iOS controls but do not merge at rest.
- Text on glass:
  - The card name and enabled labels stay text white.
  - The meta line uses glass text muted.
  - The chevron and disabled quick-action labels and symbols use glass text dim.
  - The skeleton blocks and the empty thumbnail use glass skeleton.
- Without Liquid Glass, as on iOS 17 and 18, the chip falls back to surface, and the quick-action bar, the batch button, the pull indicator, and the group and sort buttons to surface control, with the normal text colors.
- The glass never fades with opacity, because glass under opacity 0 stops rendering. The skeleton pulse animates the blocks inside the chip, not the glass.
- `expo-glass-effect` draws the glass. `GlassSurface` and `GlassGroup` in `src/components/atoms/glass-surface.tsx` wrap it.

## Shapes

- Chips and filter pills use 12 px corners. Count badges are fully round.
- Buttons and segmented controls use 8 px corners.
- Content cards and page sheets use 12 px corners. Sheets round only their top corners. The settings drawer keeps the iOS system corners, which match the system grabber.
- Card thumbnails use 4 px corners at a 63:88 card ratio. Full card images keep their own printed shape: their corner radius is 5% of the rendered width (`printedCardCornerPerWidth`), so the printed corners show and nothing behind them does.
- Binder tiles and the binder wall tiles on the sign-in screen use 8 px corners.

## Components

- **Buttons.** Primary buttons are lime with dark text: Swap in, Swap in all, Bought, Add to collection. Secondary buttons use the control surface: Close, Skip, Cancel. Destructive actions, such as **Remove scan**, use danger text on the danger tint.
  - A disabled button fades to 38% opacity, the same dimming as the other sign-in buttons while one signs in. `theme.ts` names it `opacity.dimmed`.
  - A busy button shows a spinner before its label and takes no taps. It keeps its full color.
  - A round icon button, such as the settings button or the batch button, is 38 px across on the control surface, with an 18 px symbol in the text color.
  - Every control has a touch target of at least 44 by 44 pt. A control that looks smaller, such as a 38 px button or a 24 px chip, gets the extra touch area above and below, and is at least 44 px wide.
- **Swipe to confirm.** A 52 px lime pill track with a 44 px round handle in on-primary at its left, 4 px inside the track, with a lime arrow. The label sits in the center of the track in body strong, in on-primary. Dragging the handle to the right moves it along the track with the finger. The handle rides a native horizontal scroll view, so the drawer's own drag cannot take the touch when the finger drifts up or down. Past 80% of the track, a light haptic plays, and releasing there confirms. The handle then moves to the end and shows a spinner. It stays at the end with the spinner while the action runs. When the action works and the screen closes, it stays there until the screen is gone. It goes back to the start after a release before 80%, which does nothing. It also goes back when the action fails or leaves the screen open. A busy control shows a spinner on the handle at the end and cannot be swiped. It keeps its full color, even when it is also disabled. A disabled control fades to 38% opacity. VoiceOver reads it as a button with its label, and its default action confirms without a swipe. The scroll padding is the one style that is not a class, because it comes from the track width.
- **Toggles.** A toggle is a button that stays on or off, such as Protect. It uses the control surface when off and turns lime with dark text when on. A segmented control is a row of options on one control surface with 8 px corners. The chosen option is lime.
- **Switch rows.** A switch row is a surface card with a label and an iOS switch with a lime track. A tap anywhere on the row turns the switch on or off.
- **List rows.** A list row is a surface card with an optional thumbnail, a name in body strong, and an optional meta line, such as the set code and collector number. A check row is a list row that VoiceOver reads as a checkbox. It starts with a 22 px (`sizes.rowSymbol`) `checkmark.circle.fill` in primary lime when checked, or a `circle` in text dim when not. A list row can show a small status chip under its meta line, such as an effect in the Add to deck drawer. VoiceOver adds the chip's full text to the row.
- **Disclosure rows.** A disclosure row is a surface card button with its content on the left and a 14 px text dim `chevron.right` on the right, such as the User tags row of the copy page.
- **Value rows.** A value row is a surface card with a label in body text muted on the left and its value on the right, such as "Current price" and "$1.87". VoiceOver reads the row as one element: the label, then the value.
- **Sign-in buttons.** Sign-in buttons and the sign-in Try again button are 50 px tall to match Apple's sign-in button sizing. This is the one exception to the 38 px minimum button height. Try again uses sign-in button type (17 px, semibold). Continue with Google uses 16 px medium. The system Apple button sets its own type.
- **Sign in with Apple.** The system Apple button in Apple's white style, with the "Sign in with Apple" title and 8 px corners. Apple's branding rules set its colors, logo, and type, so they sit outside the palette.
- **Continue with Google.** Google's dark button style: a #131314 fill, a 1 px #8e918f border, #e3e3e3 text, and the four-color Google logo. Google's branding rules set these colors, so they sit outside the palette.
- **Text links.** An in-app link inside a line of text, such as **Privacy policy**, keeps the type size of its line in bold lime. It is the one control without a 44 pt touch target, because a nested text run cannot take extra touch area.
- **Failure notice.** A surface card with 12 px padding and a danger mark beside the message, such as "Sign-in did not work." A long message wraps in the space beside the mark, and the mark lines up with its first line.
- **Warning line.** An 11 px symbol and a body text message, both in warning, such as "Sol Ring is protected. Reverting unprotects it." The symbol is `shield.fill` for a protected copy and the held symbol for a held copy. VoiceOver reads the message.
- **Brand mark.** A lime outlined card shape, 18 by 25 px with a 2.5 px border and 4 px corners, beside the mtgscan name. It is the one non-action use of lime.
- **Chips.** Status chips show priority, validity, estimated bracket, finish, condition, language, and copy states such as "2 free" or "Protected only". Their text uses the text, warning, danger, or info color. A status chip can show an 11 px symbol before its label in the same color, such as the shield on **Protected**. A stale status chip shows the 11 px `clock` symbol after its label in the same color. Filter chips switch to the primary lime when selected. A chip that the user can tap is at least 44 px wide. Search chips show their `key:value` text and × on the control surface, and a tap removes them. A refused search chip has danger text on the danger tint.
- **Status chip buttons.** A status chip that the user can tap, such as the validity chip and the bracket chip in the deck screen header. It has the look of a status chip, with its symbol before its label, the stale `clock` after its label, and a small 11 px `chevron.right` last, all in the same color. It is at least 44 px wide and gets the extra touch area of a chip. VoiceOver reads it as a button with its own label, such as "Deck validity, Invalid".
- **Thumbnail chips.** A card's thumbnail and its name in chip type, on surface raised with 12 px corners. They are not buttons. VoiceOver reads the card name. The Deck validity drawer shows the cards of a rule row with them, and the Estimated bracket drawer the cards of a bracket signal row.
- **Danger outline.** A 2 px danger line around the card image of a card tile, with the image's 8 px corners (`borderWidths.selectedOutline`). It marks a card that breaks a Commander rule on the deck screen's Cards tab. It has no badge, so the card image stays clear. It takes the place of the transparent 2 px frame that every card tile has, so outlined and plain tiles keep one size. The current card printing in the printing picker uses the same frame in lime.
- **Card symbols.** Oracle text writes each card symbol in braces, such as {2}{G}, {T}, or {E}. The app draws every symbol that Scryfall's symbology lists with its glyph from the Mana font (andrewgioia/mana), inline with the text and sized to body text. `SymbolText` does it for the Rules section.
  - A mana symbol is its mana glyph in mana glyph color on a 12 px circle in its mana color, like the font's cost style (`ms-cost`). The circle is about the cap height of body text, 0.85 of its 14 px size, as on Scryfall and Gatherer. It sits on the text baseline, does not raise the line height, and has 1 px of space on each side. It grows with the text size that the user sets in iOS. {G} is a green circle, and generic mana, {C}, {X}, {T}, and {S} are mana generic circles. {Q} is a white glyph on a mana glyph circle.
  - A hybrid symbol, such as {W/U}, {2/W}, or {C/R}, splits its circle on the diagonal, with the first color at the top left. Its two glyphs sit small in the two halves, 1 px from the edge, in mana symbol split type.
  - A Phyrexian symbol, such as {G/P}, is the Phyrexian glyph on the circle of its color. A hybrid Phyrexian symbol, such as {B/G/P}, splits the circle the same way. {H} is the Phyrexian glyph on a mana generic circle.
  - A half symbol, {HW} or {HR}, shows the left half of its circle.
  - Symbols that are not mana, such as {E}, {A}, {TK}, {PW}, {CHAOS}, {P}, and {D}, are bare glyphs in the text color, in mana symbol bare type.
  - A symbol that the app does not know stays as its plain text in braces, never an empty box.
  - VoiceOver reads the text with each symbol as words, such as "tap: Add green mana." or "two generic mana green mana". The words are: "white mana" for {W} and the same for each color, "colorless mana" for {C}, "two generic mana" for {2} and the same for each number, "zero mana" for {0}, "X generic mana" for {X}, {Y}, and {Z}, "half generic mana" for {½}, "infinite generic mana" for {∞}, "white or blue mana" for {W/U}, "two generic or white mana" for {2/W}, "colorless or white mana" for {C/W}, "Phyrexian green mana" for {G/P}, "Phyrexian black or green mana" for {B/G/P}, "Phyrexian colorless mana" for {C/P}, "Phyrexian mana" for {H}, "half white mana" for {HW}, "snow mana" for {S}, "legendary mana" for {L}, "tap" for {T}, "untap" for {Q}, "energy" for {E}, "acorn" for {A}, "ticket" for {TK}, "planeswalker" for {PW}, "chaos" for {CHAOS}, "pawprint" for {P}, and "land drop" for {D}.
- **Count badges.** Red numerals on the Recent tab, the Planned option of the deck screen, the commander gallery card, and the batch button. A count of 0 shows no badge. On a basic land tile of Collection, the count badge shows ∞, 4 px from the top right corner of the card image.
- **Stepper.** A secondary icon button with the `minus` symbol, the count in body strong, and a secondary icon button with the `plus` symbol, in one row. Minus is off at the lowest count and plus at the highest. The count sits in a 44 px wide column, so the buttons do not move as it changes.
- **Stepper row.** A surface row with the card thumbnail, the name in body strong, and a stepper at its right end. The Add to deck drawer uses it for a basic land.
- **Change lines.** A planned swap, buylist card, or deck change shows a green plus row for the incoming card and a red minus row for the outgoing card. Each row has a thumbnail, the card name, and the type line or printing. The reason follows in body text, with the AI client name and time in meta text.
- **Deck tag.** A pill on the control surface, as tall as a chip, with the 18 px commander avatar and the deck name in chip type. It is used on Recent items and the deck line of the copy page. It opens the deck. VoiceOver reads it as a button with the deck name and the hint "Opens the deck." It gets the extra touch area of a chip.
- **Commander avatar.** The art crop of a commander in a circle: 40 px in a list row and on the commander gallery card, 48 px on the deck screen banner, 18 px in a deck tag, and 16 px on the meta line of a binder tile. A list row, a deck tag, and a binder tile show the deck's first commander. The gallery card and the banner show the second. A deck with no commander shows a dashed line-colored circle instead.
- **Latest-scan chip.** One horizontal chip at the bottom of Scan, 16 px from the edges, on Liquid Glass. It has 8 px padding and three columns (owner request, #113):
  - The left column holds the card thumbnail.
  - The middle column holds the card name in body strong, centered over a centered meta line with the set code in capitals and the collector number, such as "M10 146".
  - The right column holds a 14 px text dim `chevron.right` symbol, centered, that shows the chip opens the details. The skeleton chip and the basic land chip have no chevron.
  - The two side columns are both as wide as the card thumbnail, so the name and the meta line sit centered on the chip.
  - A new scan replaces the chip.
  - The meta line adds the finish when it is not nonfoil: "M10 146 · Foil".
  - When the phone is online, the meta line ends with the current price of the scan's card printing and finish, such as "M10 146 · $1.87", in price type in the meta line's color. A card printing and finish with no current price shows a text dim "–". A stale price has the 11 px `clock` symbol before it. While the price loads, after a failed read, and offline, the meta line shows no price, no error, and no placeholder. VoiceOver adds the price, or "no price", to the chip label when it is known: "Lightning Bolt, M10 146, $1.87".
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
  - When no card name matches the text, a line in text muted says so, such as "No card names match "zzzz".".
- **Batch button.** A round icon button on glass at the top right of Scan, 8 px below the safe area, with the `rectangle.portrait.on.rectangle.portrait.angled` card-stack symbol. Without Liquid Glass, it uses the control surface. A count badge on its top right corner counts the scans in the scan batch, the same N as the batch review title. With no scan to add, the button shows no badge. VoiceOver reads "Scan batch, 3". The button shows in every Scan tab state, and it opens batch review.
- **Pull indicator.** A glass pill centered at the top of Scan, on the batch button's row. It is 38 px tall with full corners and 12 px side padding. It holds an 18 px symbol in the text color and its label in body strong, 8 px apart. The symbol is `arrow.down` while pulling and for "Nothing to add", `plus` for "Release to add", a spinner while adding, and the danger mark of the failure notice for "Failed to add". Without Liquid Glass, it uses the control surface. See Scan in Layout for its states.
- **Batch review.** A bottom drawer with the iOS grabber, at full height only. It closes with a downward swipe. Its title is "N cards scanned", such as "3 cards scanned", or "1 card scanned" for one. N counts the scans in the scan batch, the same N as the batch button badge and the **Remove all scans** alert. The title sits in a native navigation bar in sheet title type, on the sheet color with no line under it.
  - A ••• bar button with the `ellipsis` symbol sits on the right of the bar. VoiceOver reads it as "More". It opens a native menu with one red item, **Remove all scans**, and no submenu.
  - **Remove all scans** shows a native alert over batch review, in the same form as the **Delete copy** alert. It has **Remove** in red and **Cancel**.
  - The alert title is "Remove all N scans?", such as "Remove all 3 scans?". N counts every scan in the scan batch. The message is "They will not be added to your collection."
  - For one scan, the title is "Remove 1 scan?" and the message is "It will not be added to your collection."
  - **Remove** empties the scan batch and closes batch review. The batch button shows no badge, and the latest-scan chip is empty. A card that is still being recognized adds no scan afterwards, and it plays no haptic and no sound. Nothing is added to the collection, and a commit that failed is not sent again.
  - Closing the menu or tapping **Cancel** changes nothing.
  - The ••• button is disabled when the scan batch is empty, and hidden while the commit runs.
  - A tap on a row pushes that scan's details into the same drawer, which stays at full height. The pushed details have the native back button, labeled with the drawer title, and go back with the swipe from the left edge too. **Remove scan** removes the copy and returns to the list.
  - **Scans** lists every scan as its own row, newest first. Identical copies are not merged, and rows have no +/- control. A row has the thumbnail, the card name, and a meta line with the set code and collector number, the finish when it is not nonfoil, the condition, and the language: "M10 146 · Foil · NM · English". A tap pushes the scan details, to edit or remove that copy.
  - When the phone is online, each row shows the current price of its card printing and finish at its right end, in price type in text price, such as "$1.87". Condition and language do not change it. A card printing and finish with no current price shows a text dim "–". A stale price has the 11 px `clock` symbol before it. While the price loads, after a failed read, and offline, the row shows no price, no error, and no placeholder. VoiceOver adds the price, or "no price", to the row label when it is known: "Lightning Bolt, M10 146 · NM · English, $1.87".
  - Batch review shows no total of its current prices. The title stays a count.
  - A swipe to confirm control labeled **Add to collection** stays at the bottom of the drawer. It shows no count. Swiping its handle past 80% of the track adds the scan batch. It is busy while the commit runs. After a commit that works, the handle stays at the end with its spinner until the drawer has closed. After a commit that fails, the handle goes back to the start, and the control reads **Try again**.
  - A commit that works closes the review and removes the added scans. The chip is empty, unless it shows a scan that was not recognized. The Collection tab shows the cards the next time it opens.
  - A commit that fails shows the failure notice "Could not add to your collection. Your scans are kept." above the control, and the control reads **Try again** until a commit works. Each scan has its own copy ID, so the server never adds the same copy twice, even when the scan batch changed after the failure.
  - When the app restarts after a commit that failed or was still running, it sends the commit again by itself.
  - While the commit runs, rows do not open.
  - With an empty scan batch, batch review shows its empty state in place of the list, and the **Add to collection** control hides. See Empty states. The control stays while a commit that works closes the drawer. Scans that were not recognized never enter the scan batch, so the control never shows disabled.
  - The phone saves the scan batch for each account, so they survive a restart. Another account on the phone does not see them.
- **Binder tile.** One copy's card image with a meta line and a price line under it. There is no quantity badge and no chip.
  - Until the image loads, the tile is a line-colored card shape.
  - The meta line sits 4 px below the card image, centered, in meta text in text muted: the set's expansion symbol from Scryfall at 16 px tinted with the rarity color of the card printing (see Colors), then the collector number. A protected copy starts the line with an 11 px `shield.fill` symbol in warning, before the set symbol: "[shield] [symbol] 136". A copy in a deck starts the line with its deck's first commander art in a 16 px circle, before the shield: "[commander] [shield] [symbol] 136". A deck with no commander shows a dashed circle. A copy held by a planned swap starts the line with an 11 px `bookmark.fill` symbol in info, the held symbol: "[held] [symbol] 136". A held copy is never in a deck and never protected. When the card catalog has no symbol for the set, or it has not loaded, the set code in capitals takes its place. A copy that is not NM adds a text dim " · " and its condition: "[symbol] 136 · MP". Every condition uses the same text muted color.
  - The line never names the finish. A foil copy has a faint rainbow sheen over its card image, and an etched copy has a faint silver sheen. Nonfoil copies have none. The sheen does not move. It is a diagonal gradient at 30% opacity, so the card art reads normally.
  - The price line sits 4 px below the meta line, centered, in price type (12 px, semibold) in text price, slightly brighter than the meta line. It shows the copy's current price in full, such as "$1,635.37". The price is the current Scryfall price for the card printing and finish. Condition and language do not change it. It is in the currency of the settings drawer. A converted price shows no "≈" and no currency letters, such as "$12.30" in AUD.
  - A copy with no price for its card printing and finish shows a text dim "–". A price is never taken from another finish or card printing.
  - A stale price, older than 24 hours, has a small 11 px `clock` symbol in text price before it. The symbol is neutral, not a warning.
  - VoiceOver reads the tile as one button: the name, the set code in capitals and the collector number, then the finish when it is not nonfoil and the condition when it is not NM, in words, then "protected" for a protected copy, then "in the deck" and the deck name for a copy in a deck, then "held for the deck" and the deck of its planned swap for a held copy, then the price or "no price": "Bloomvine Regent // Claim Territory, TDM 136, foil, moderately played, protected, in the deck Atraxa, $1,635.37". A converted price adds "about": "…, about $12.30". A stale price adds the hint "The price may be out of date."
  - Tapping the tile opens the copy page.
- **Empty states.** Every empty state uses one layout, variant C of the HTML prototype (`prototypes/empty-states/index.html` on `prototype/empty-states`, commit 961e3ae). The `EmptyState` molecule draws it, and each page passes its own illustration.
  - From top to bottom: an illustration, a title in sheet title type in text white, one line of body text in text muted, and at most one primary (lime) button, 16 px apart. The text is centered.
  - The illustration is made of shapes from the app in line color, such as empty binder slots or ghost rows. It uses no images. On the background, it fades downward into the background from 30% of its height (`gradients.emptyStateFade`). On a page sheet or a drawer, such as the Bought page sheet, it fades into the sheet color in the same way (`gradients.emptyStateSheetFade`). Over the camera and in batch review it does not fade.
  - A dashed shape has a 2 px dashed line-colored outline (`borderWidths.illustrationOutline`). The symbol in the dashed card frame is 40 px (`sizes.emptyStateSymbol`) in line color.
  - A ghost Needs you item is a surface with a deck tag row and two change lines, 8 px apart. The deck tag row has a round 24 px block and a 12 px bar, 33% wide, 8 px apart. Each change line sits on surface raised, with the sign in text dim, a block the size of the card thumbnail, and a 12 px bar, 50% wide.
  - A ghost commander card has a 14 px bar for the deck name, 50% wide, over two 24 px chip-shaped blocks, 17% and 20% wide. The ghost commander card draws them in the dashed frame of a commander gallery card.
  - The skeletons on Recent, on Decks, and on the deck screen use these same shapes. Their blocks pulse like the skeleton grid. The ghost blocks do not pulse.
  - Titles have no final period.
  - VoiceOver reads the title and the body as one element, such as "No decks yet, Create a deck, then add cards to it from your collection." It skips the illustration and reads the action as a button.
  - Each page's text:

    | Page | Illustration | Title | Body | Action |
    | --- | --- | --- | --- | --- |
    | Recent, no Needs you items | two ghost Needs you items | Nothing needs you yet | Planned swaps and buylist cards from your AI chat show up here. | none |
    | Recent, read failed | two ghost Needs you items | Could not load Recent | Check your connection. | **Try again** reads Recent again |
    | Bought page sheet, no free copies | one row of empty binder slots | No copies found | Scan copies into your collection first. | none |
    | Bought page sheet, read failed | one row of empty binder slots | Could not load your copies | Check your connection. | **Try again** reads the free copies again |
    | Collection, no copies | two rows of empty binder slots | Your collection is empty | Scan cards to add them to your collection. | **Scan cards** opens the Scan tab |
    | Collection, read failed | one row of empty binder slots | Could not load your collection | Check your connection. | **Try again** reloads the binder grid |
    | Copy page, read failed | a dashed card frame with `wifi.slash` | Could not load this card | Check your connection. | **Try again** reads the copy again |
    | User tag picker, read failed | a dashed card frame with `wifi.slash` | Could not load your user tags | Check your connection. | **Try again** reads the copy and the user tags again |
    | Collection search, no results | one row of empty binder slots | No cards found | Check the spelling or try fewer words. | none |
    | Decks, no decks | a ghost commander card | No decks yet | Create a deck, then add cards to it from your collection. | **Create deck** opens the name alert |
    | Decks, read failed | a ghost commander card | Could not load your decks | Check your connection. | **Try again** reads the decks again |
    | AI clients list, read failed | a dashed card frame with `wifi.slash` | Could not load the AI clients | Check your connection. | **Try again** reads the AI clients again |
    | Add to deck drawer, read failed | a ghost commander card | Could not load your decks | Check your connection. | **Try again** reads the decks again |
    | Deck screen, Planned with none | two ghost Needs you items | Nothing planned yet | Planned swaps and buylist cards for this deck show up here. | none |
    | Deck screen, Cards of an empty deck | one row of empty binder slots | No cards yet | Add cards from a copy's page in your collection. | **Open Collection** opens the Collection tab |
    | Deck screen, read failed | a dashed card frame with `wifi.slash` | Could not load this deck | Check your connection. | **Try again** reads the deck again |
    | Scan, camera access off | a dashed card frame with `video.slash` | Camera access is off | Turn it on in Settings to scan cards. | **Open Settings** opens iOS Settings |
    | Scan, no camera | a dashed card frame with `questionmark.video` | Camera not available | This device has no camera. | none |
    | Batch review, empty scan batch | three ghost batch rows | No scans yet | Cards you scan wait here until you add them. | none |

  - A refused search chip shows its message, such as "No set named "zzz".", as the title of the Collection search empty state, with no body.
- **Commander gallery card.** A full-width button, at least 140 px tall, with 12 px corners. The deck name and chips stay at least 32 px below its top edge, clear of the count badge, and the card grows when they need more room. The deck name sits at its bottom in card title type, over the validity chip and the bracket chip, with the look of the deck screen header. The chips are not buttons, and a tap anywhere opens the deck. A stale validity chip or bracket chip adds the 11 px `clock` symbol after its label, in the same color. VoiceOver then adds the hint "The rules data may be out of date." to the card. The card shows no deck priority and no card count. An empty deck shows no chips. VoiceOver reads it as one button, such as "Kinnan, Invalid, Estimated bracket 4" or "Atraxa". It shows the art crop of the deck's first commander under a dark gradient (`gradients.commanderArtScrim`), and a second commander as a 40 px commander avatar at its top right. A deck with no commander shows the ghost commander card: a dashed line-colored outline on the surface color. A deck with open planned swaps or buylist cards has a count badge with their number at its top left, 12 px from the corner. VoiceOver reads "Needs you" and the count after the name, such as "Kinnan, Needs you 2, Invalid, Estimated bracket 4". The deck screen banner uses the same art, fade, and ghost commander card, but runs edge to edge with square corners. See Pushed screens.
- **Floating menu buttons.** A round Liquid Glass button, 48 px across, with an 18 px symbol, that opens a native menu with a title and a check mark on the current choice. Without Liquid Glass, it uses the control surface. The symbol is in the text color while the choice is the default, and primary lime otherwise. There is no badge or dot.
  - The sort button shows `arrow.up.arrow.down` and a menu titled "Sort by". An arrow beside the current sort shows its direction. VoiceOver reads "Sort" and the sort with its direction, such as "Sort, Name, A to Z". Collection and the deck screen's Cards tab share it.
  - The group button on the deck screen's Cards tab shows `rectangle.3.group` and a menu titled "Group by". VoiceOver reads "Group" and the grouping, such as "Group, Type".
- **Name alert.** A native alert with a title, a message, a name field, **Cancel**, and a confirm button, such as **Create**. The field takes at most 64 characters. The confirm button is off while the trimmed name is empty. A new alert starts with an empty field, or with the current name when it renames.

## Do's and Don'ts

- **Do** give each item in an action menu its SF Symbol before the label: `pencil` for Rename, `flag` for Priority, `trash` for each delete and for Remove all scans, `minus.circle` for Remove from deck, `shield` for Protect, `shield.slash` for Unprotect, `plus.rectangle.on.rectangle` for Add to deck, `crown` for Make commander and Make partner, `rectangle.stack` for Move to main deck, and `rectangle.portrait` for Open card. Choice menus, such as Sort by and Group by, keep their check marks and direction arrows.
- **Do** style new UI with NativeWind classes named after the tokens.
- **Don't** add inline style objects to new UI, or a value outside the tokens without a reason in this file.
- **Do** show the most likely printing after every scan, and keep the other options one tap away.
- **Do** list "Needs you" items oldest first, so the longest wait is on top.
- **Do** keep every deck change a user action, and show the AI's reason with every planned swap and buylist card that an AI client made.
- **Do** keep the phone's back gesture working on every pushed screen.
- **Do** flag validity problems ("Would make it invalid") without blocking the action.
- **Don't** show recognizer confidence, similarity scores, or "unsure" states.
- **Don't** add "Find in decks" style shortcuts that duplicate visible deck tags.
- **Don't** mark buylist-out cards on the deck's Cards tab. Only planned swaps hold a copy.
- **Don't** use the primary lime for decoration. It always means "you can act here" or "selected". The brand mark is the one exception.
- **Don't** draw anything over the camera except the card outline, the batch button, the latest-scan chip, and the pull indicator.
- **Do** keep Liquid Glass to the controls that float over the camera, and keep the dark surface fallback.
- **Don't** open a drawer over a drawer, a modal over a modal, or a drawer over a modal. Push a screen inside the drawer instead. A modal, such as a native alert, may open over a drawer (see Sheets).
