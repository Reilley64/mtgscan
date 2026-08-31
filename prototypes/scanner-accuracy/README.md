# Scanner accuracy prototype

**Throwaway Wayfinder prototype.** This workspace asks whether a pure-Expo, three-still burst can produce useful physical-card recognition evidence before mtgscan adds native preview-frame processing. It is not application architecture and does not touch the collection.

## Current boundary

- `mobile/` is an Expo/React Native TypeScript harness. It uses only `expo-camera` for camera access. It keeps the scan batch in memory.
- `service/` is a local Node.js TypeScript HTTP service. It center-crops the card-shaped region aligned with the 72% mobile guide, computes a deterministic 64-bit difference hash, optionally reads the title strip with Tesseract, fuses the evidence, and returns ranked Scryfall printings or an abstention.
- `shared/` contains client-neutral Zod schemas and TypeScript contracts.
- `sample/kill-test-manifest.json` has 5 synthetic sample printings. `sample/benchmark-manifest.json` has 30. Neither contains collection data. Replace a copy with exact physical printings available to the tester when needed.
- `.prototype-data/` is ignored. It holds Scryfall metadata, full reference images, physical captures, derived hashes, outcomes, and reports.

Expo Camera does not expose arbitrary live preview frames through its documented interface. This phase therefore uses three calls to `takePictureAsync()`, not tracking, live quality gates, or a frame processor. The optional guided-tilt clip is captured and transmitted as evidence, but **foil inference is not implemented or proven**. Embeddings, geometric reranking, duplicate suppression, missed-change detection, and collection integration are also not implemented. Android is untested.

## Prerequisites

- Node.js 22 or later and npm
- An iPhone 16e on the same LAN as the computer
- Current Expo Go, or an Apple Developer account and EAS CLI for a development build
- Five or more physical cards whose exact printings are in the chosen manifest

Install once from this directory:

```bash
npm install
cp service/.env.example service/.env
cp mobile/.env.example mobile/.env
```

Edit `mobile/.env` to use the computer's LAN address. `localhost` points at the phone and will not work. Allow inbound TCP port 4317 in the computer firewall. HTTP is intentional on a trusted test LAN only.

## Prepare Scryfall references

The default preflight downloads card metadata with Scryfall's collection endpoint and caches one full reference image per printing. Requests send explicit `User-Agent` and `Accept` headers, run sequentially, retry once, enforce timeouts and response-size bounds, and reuse the cache.

```bash
npm run corpus:prepare -w @scanner-accuracy/service
```

For a reproducible 40-card manifest selected from a local ManaBox export, run:

```bash
npm run select:manifest -w @scanner-accuracy/service -- --input ../../current_collection.csv --size 40
npm run corpus:prepare -w @scanner-accuracy/service -- --personal
```

The selector only reads the CSV. It writes `.prototype-data/personal-kill-test-manifest.json` and `.prototype-data/personal-kill-test-coverage.json`, both ignored. The manifest retains only Scryfall printing ID, name, set, collector number, language, and ground-truth finish. It does not copy purchase, condition, storage, or other collection fields. Selection is stable for the same owned variants. It favors same-name printings, owned foil/nonfoil pairs, pre-M15 or old-frame proxies, special treatments, unusual collector numbers, non-English cards, and double-faced layouts, then fills with ordinary controls. The coverage report names missing strata instead of inventing examples. Quantity is treated as an upper bound; the selector never chooses more copies of a variant than are owned.

For the checked-in synthetic 30-card sample instead:

```bash
npm run corpus:prepare -w @scanner-accuracy/service -- --benchmark
```

The optional daily `default_cards` bulk metadata cache is large. It is not needed for the selected-corpus baseline:

```bash
PREPARE_BULK=1 npm run corpus:prepare -w @scanner-accuracy/service -- --benchmark
```

Scryfall images remain research references. Do not present this cache as a public image proxy or redistribute it.

## Start the service and Expo

In terminal 1:

```bash
npm run start -w @scanner-accuracy/service
curl http://localhost:4317/health
```

Set `OCR_ENABLED=1` before starting to enable constrained title-strip OCR. Tesseract is installed, but it is off by default because its worker startup is slow. When disabled or when it fails, every candidate reports OCR as unavailable. The service never fabricates OCR, embedding, or finish evidence.

In terminal 2:

```bash
npm run start -w mobile
```

Open the QR code in current Expo Go. For a development build, install and sign in to EAS, then run the interactive commands below. Apple credential, device registration, signing, and installation confirmations are human steps:

```bash
npx eas-cli login
cd mobile
npx eas-cli build:configure
npx eas-cli build --profile development --platform ios
npx expo start --dev-client
```

Generated native/build directories are ignored. No Swift or Kotlin belongs in this phase.

## iPhone 16e physical test

1. Confirm `/health` shows the expected corpus count.
2. Open the app and grant camera permission.
3. Check the LAN service URL in the app.
4. Put one exact manifest printing on a plain surface in ordinary indoor light. Keep the full card in the centered guide.
5. Select JPEG quality. Start at `0.7`.
6. Optionally record the four-second guided tilt. The service retains no special video-derived score and labels finish evidence unavailable.
7. Tap **Capture 3 stills and recognize**. Review progress, abstention reasons, confidence, and per-strategy evidence.
8. Select or type the correct Scryfall printing ID. Correct language and finish. The finish starts as `unknown` because it is not inferred.
9. Record the outcome. The mobile scan batch remains in memory; the service appends the benchmark outcome under `.prototype-data/`.
10. Swap cards deliberately and repeat. Record full sessions, including abstentions and failures. Do not keep only successful scans.

### Kill test before the full corpus

Use the checked-in five-card manifest first, or the ignored owned-card manifest after selection. For the five-card preflight, capture each exact printing three times: diffuse light, normal warm indoor light, and one glare-prone angle. Do not proceed to the full sample if the harness crashes, any card never appears in the top three, or fewer than 12 of 15 presentations contain the correct identity in the top three. This small gate only kills a clearly weak still-burst baseline. It does not resolve the ticket or validate auto-accept.

To start the full sample with clean outcomes, archive or remove only `.prototype-data/outcomes.ndjson` and `.prototype-data/reports/`. Never use collection exports as a corpus file.

## Report

Generate a JSON report after outcomes exist:

```bash
npm run report -w @scanner-accuracy/service
# or
curl -X POST http://localhost:4317/reports/generate
```

Reports are written to `.prototype-data/reports/`. They calculate identity top-1/top-3, exact-printing accuracy, false-auto-accept rate, auto-accept coverage, correction rate, latency p50/p95, and cards/minute when session timing exists. When finish ground truth exists, finish coverage reports `0` while accuracy and the confusion matrix remain unavailable because this baseline makes no finish prediction. Duplicate and missed-change measures are explicitly `unavailable`.

## Decision criteria

The research gate is exact:

- identity top-1 at least 99%;
- exact Scryfall Card ID at least 97%;
- correction rate at most 5%;
- proposal latency p95 below 1.5 seconds;
- at least 30 correct cards per minute; and
- an auto-accept threshold whose false-auto-accept upper 95% confidence bound is below 0.5%, reported with its coverage.

Finish may remain behind confirmation if it misses the safety bar. The final study must publish an accuracy/coverage curve, not one threshold.

This 5/30-card harness does not compute confidence intervals and is not the required representative study. Ticket resolution still requires the research plan's 240 owned physical cards, about 2,880 positive presentations, negative/change events, hard-negative families, sleeves, lighting, languages, finish strata, multiple operators, two iPhones, and two Android phones. Pure-Expo repeated stills also cannot measure live tracking, stable-card latency, duplicate suppression, missed changes, or thermal behavior. **The prototype cannot resolve the ticket until physical evidence is collected.**
