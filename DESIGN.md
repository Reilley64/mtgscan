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
  primary: "#d8ff62"
  on-primary: "#101500"
  warning: "#f4d06f"
  danger: "#ff7a70"
  incoming: "#d8ff62"
  outgoing: "#ff8a7a"
  info: "#8fd3ff"
  badge: "#e0244a"
  card-outline: "#ff4fd8"
  camera-off: "#000000"
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
  meta:
    fontFamily: SF Pro Text
    fontSize: 12px
  chip:
    fontFamily: SF Pro Text
    fontSize: 11px
    fontWeight: 700
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
  tab-bar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text-dim}"
    typography: "{typography.tab-label}"
  tab-bar-selected:
    textColor: "{colors.primary}"
  count-badge:
    backgroundColor: "{colors.badge}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    height: 17px
  card-thumbnail:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.xs}"
    width: 40px
    height: 56px
  meta-text:
    textColor: "{colors.text-muted}"
    typography: "{typography.meta}"
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
  latest-scan-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 8px 16px 8px 8px
---

# mtgscan design

## Overview

mtgscan is a personal iPhone app for one Commander player. It scans Magic cards one at a time, keeps the collection, and turns AI deck suggestions into deck changes that the user controls. The interface is dark and card-first. Real card images carry the color, and the chrome stays quiet around them.

Three ideas shape every screen:

- **The card is the hero.** Card images are large and recognizable. Text supports the image and never replaces it.
- **The user decides.** The AI only writes deck suggestions. Every deck change, planned swap, and buylist card is the user's action. Nothing changes a deck without a tap.
- **No noise about confidence.** The scanner always shows its best guess, and the user switches it in one tap when needed. Confidence numbers are never shown.

This file records the design settled in Wayfinder tickets #11 (scan batch flow) and #18 (AI deck changes, history, and planned swaps). Domain terms follow `CONTEXT.md`.

## Colors

The palette is near-black neutrals with one lime accent. Card art supplies every other color.

- **Background (#080b0d)** is the screen base. **Surface (#11171a)** holds cards and grouped content. **Surface raised (#1a2125)** and **surface control (#232c31)** separate inner rows, buttons, chips, and segmented controls. **Sheet (#161c1f)** is the iOS page sheet. **Line (#2a3238)** draws hairlines and empty image slots.
- **Text (#ffffff)** is primary. **Text muted (#b5c0c5)** is for printing details and captions. **Text dim (#7d8a90)** is for unselected tab labels and quiet metadata.
- **Primary (#d8ff62)**, the lime accent, is the single interaction color: the primary button, the selected chip, the selected tab, section headings, and in-app links. Text on it is **on-primary (#101500)**.
- **Incoming (#d8ff62)** and **outgoing (#ff8a7a)** mark the plus and minus lines of a deck suggestion, planned swap, or deck change.
- **Warning (#f4d06f)** marks protected copies and caution states. **Danger (#ff7a70)** marks invalid decks and destructive actions such as remove scan or revert. **Info (#8fd3ff)** marks the estimated bracket and in-deck counts.
- **Badge (#e0244a)** is only for count badges on tabs and buttons, such as Needs you.
- **Card outline (#ff4fd8)** is the magenta line the scanner draws around a detected card. Nothing else uses it.
- **Camera off (#000000).** The Scan tab is pure black until the camera feed replaces it.

## Typography

The app uses the iOS system font, SF Pro, at a few weights.

- **Large title** (28 px, heavy) names top-level tabs: Recent, Collection, Decks.
- **Card title** (20 px, heavy) names a card on the card page, and a deck in the deck header and the commander gallery.
- **Sheet title** (17 px, heavy) titles page sheets.
- **Body** (14 px) carries reasons, rules text, and list content. **Body strong** labels buttons and card names in rows.
- **Meta** (12 px, muted) carries set and collector number, finish, condition, language, and timestamps.
- **Chip** (11 px, bold) labels chips and status pills. **Tab label** (10 px, bold) sits under tab bar icons.

Copy is plain sentence case and uses glossary terms exactly: deck suggestion, planned swap, buylist card, free copy, protected copy, estimated bracket.

## Layout

The app is built for an iPhone in portrait. The page inset is 16 px, cards sit 12 px from the edges, and rows use 8 px gaps.

### App shell

A bottom tab bar holds four tabs, in this order: **Recent, Collection, Decks, Scan**. Recent has a count badge for the items that need the user.

- **Recent** is the home across all decks.
  - **Needs you** comes first, **oldest first**: open deck suggestions, planned swaps ready to swap in, and open buylist cards.
  - **Recent changes** follows, newest first, with day separators. It holds deck changes, reverts, Bought, swap-ins, promotions, dismissals, AI withdrawals, reason edits, and collection events.
  - Each item carries a tag with the commander avatar and deck name, or a Collection tag. The tag opens that deck.
  - Filter chips: All, Suggestions, Planned swaps, Buylist, Deck changes.
  - Every item keeps its actions inline: Promote, Dismiss, Swap in, Bought, and revert from here.
- **Collection** is a binder grid.
  - Card images sit 3 per row, with **one tile per printing**.
  - Corner badges total every copy of that printing, across finish, condition, language, and protected: owned, free, in decks, held by a planned swap, and protected.
  - Free follows the glossary's free copy, so it includes protected free copies. The protected badge shows beside it.
  - Search matches name, type, and printing, in the collection only. Filters: All, Free, Allocated, Protected.
- **Decks** is a commander gallery: one large commander art card per row, highest priority first. The name, priority, validity, and estimated bracket sit over the art, with a Needs you count.
- **Scan** is a black screen that the camera feed replaces. The batch button sits top right, and the latest-scan chip sits at the bottom.

### Pushed screens

Pushed screens cover the whole screen, including the app tab bar. There are **no on-screen back buttons**. The user goes back with the phone's own gesture, which on iOS is the swipe from the left edge.

- **Card page**, from a collection tile, opens that printing:
  - a hero image of the printing over its blurred art;
  - name, type line, and chips for the set code and collector number;
  - Protect one free copy or Unprotect one copy of this printing;
  - a segmented control:
    - **Copies**: counts totalled over every copy of this printing, a one-line summary for the card across printings, this printing's copies listed by collection entry (finish, condition, language, quantity, decks, protected), and the user's other printings, each opening its own page;
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
- revert;
- the scan details sheet;
- batch review.

## Elevation & Depth

The interface is flat. Depth comes from tone, not shadow.

- Content sits on surface tones that step up from the background: surface, surface raised, surface control.
- Page sheets slide over a dimmed, slightly scaled screen. A soft shadow above the sheet is the only strong shadow.
- The tab bar is a near-opaque bar with a hairline top border.
- During a back swipe, the screen follows the finger with a shadow on its left edge.

## Shapes

- Chips and filter pills use 12 px corners. Count badges are fully round.
- Buttons and segmented controls use 8 px corners.
- Content cards and page sheets use 12 px corners. Sheets round only their top corners.
- Card thumbnails use 4 px corners at a 63:88 card ratio. Full card images keep their own printed shape.

## Components

- **Buttons.** Primary buttons are lime with dark text: Promote, Swap in, Bought, Add to collection. Secondary buttons use the control surface: Dismiss, Skip, Cancel. Destructive actions use danger text on a dark red surface.
- **Chips.** Status chips show priority, validity, estimated bracket, finish, condition, language, and copy states such as "2 free" or "Protected only". Filter chips switch to the primary lime when selected.
- **Count badges.** Red numerals on the Recent tab, the deck Suggestions tab, the batch button, and the card page Decks tab.
- **Change lines.** A deck suggestion, planned swap, or deck change shows a green plus row for the incoming card and a red minus row for the outgoing card. Each row has a thumbnail, the card name, and the type line or printing. The reason follows in body text, with the AI client name and time in meta text.
- **Deck tag.** A small commander avatar plus the short deck name, used on Recent items and card page deck lists. It opens the deck.
- **Latest-scan chip.** One horizontal chip at the bottom of Scan: a thumbnail, the card name, and the set and number, plus the finish when not nonfoil. A new scan replaces it. A pulsing skeleton chip, with a grey image block and two grey lines, shows from the moment a detected card is stable until the result arrives. Tapping the chip opens a page sheet with the details, other options, every same-text printing, and "None of these: search".
- **Batch button.** A round card-stack icon at the top right of Scan with a count badge. It opens batch review, which merges identical copies into stacks before "Add to collection".
- **Binder tile.** One printing's card image, with a set and collector number caption and corner badges totalled over its copies. Tiles of printings with a foil copy carry a subtle sheen.
- **Commander gallery card.** Full-width commander art with a dark gradient, the deck name in card-title type, status chips, and a Needs you badge.

## Do's and Don'ts

- **Do** show the most likely printing after every scan, and keep the other options one tap away.
- **Do** list "Needs you" items oldest first, so the longest wait is on top.
- **Do** keep every deck change a user action, and show the AI's reason with every deck suggestion.
- **Do** rely on the phone's back gesture for pushed screens.
- **Do** flag validity problems ("would make this deck invalid") without blocking the action.
- **Don't** show recognizer confidence, similarity scores, or "unsure" states.
- **Don't** add on-screen back buttons or "Find in decks" style shortcuts that duplicate visible deck tags.
- **Don't** mark suggested-out or buylist-out cards on the deck's Cards tab. Only planned swaps are commitments.
- **Don't** use the primary lime for decoration. It always means "you can act here" or "selected".
- **Don't** draw anything over the camera except the card outline, the batch button, and the latest-scan chip.
