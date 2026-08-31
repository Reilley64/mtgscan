# Scanner accuracy prototype

**Rejected Wayfinder prototype.** This workspace tested whether a pure-Expo, three-still burst could produce useful physical-card recognition evidence before mtgscan adds native preview-frame processing. The iPhone 16e early kill rejected this dHash/OCR baseline. It is retained only as reproducible evidence, is not application architecture, and does not touch the collection.

## Current boundary

- `mobile/` is an Expo/React Native TypeScript harness. It uses only `expo-camera` for camera access. It keeps the scan batch in memory.
- `service/` is a local Node.js TypeScript HTTP service. It center-crops the card-shaped region aligned with the 72% mobile guide, computes a deterministic 64-bit difference hash, optionally reads the title strip with Tesseract, runs image-only, OCR-only, and hybrid rankings over the same three stills, and returns ranked Scryfall printings or abstentions for each strategy.
- `shared/` contains client-neutral Zod schemas and TypeScript contracts.
- `sample/kill-test-manifest.json` has 5 synthetic sample printings. `sample/benchmark-manifest.json` has 30. Neither contains collection data. Replace a copy with exact physical printings available to the tester when needed.
- `.prototype-data/` is ignored. It holds Scryfall metadata, full reference images, physical captures, derived hashes, outcomes, and reports.

This baseline is strictly still-only: Expo Camera does not expose arbitrary live preview frames through its documented interface, so it uses three calls to `takePictureAsync()`. It does not implement tracking, live quality gates, automatic preview detection, or a frame processor. The eventual flow is place card → detect centered and stable → automatically capture a still → recognize → ask for confirmation only when needed. Native-frame processing is the follow-up that must provide the required preview frames; it is not implemented here. **Finish prediction is explicitly unavailable**, so testers confirm finish manually. Embeddings, geometric reranking, duplicate suppression, missed-change detection, and collection integration are also not implemented. Android is untested.

## Physical result: baseline rejected

On 2026-08-31, an iPhone 16e running App Store Expo Go recorded five formal presentations before the early-stop gate fired: one DSC Arcane Signet and four SLD Arcane Signet presentations. The exact SLD printing was outside every strategy's top 10 in three presentations and reached rank 2 once, behind the wrong Arcane Signet printing. All strategies abstained. The five-scan report recorded 40% hybrid identity top-3 recall, 0% Scryfall-printing top-1 accuracy under the abstention rule, 0% auto-accept coverage, 100% correction rate, 815 ms service p95, and 3,422 ms end-to-end proposal p95. The throughput value is invalid because human discussion introduced idle gaps inside the session and must not be used.

This was an intentionally small kill test, not a representative accuracy study. It is sufficient to reject this candidate, not to validate another pipeline. **Do not proceed to the 30-card or 40-card full-corpus procedure with this baseline.** The next experiment must use preview-frame processing for centered/stable automatic capture and stronger visual matching. Guided tilt is not part of the desired user flow.

## Prerequisites

- Node.js 22 or later and npm
- An iPhone 16e on the same LAN as the computer
- Expo Go from the iPhone App Store, which currently targets Expo SDK 54, or an Apple Developer account and EAS CLI for a development build
- Five or more physical cards whose exact printings are in the chosen manifest

The mobile workspace intentionally pins Expo SDK 54 so that it runs in the App Store Expo Go client. Before any later Expo upgrade, verify which SDK the App Store client supports first; do not upgrade the project beyond that SDK. Run `npm run verify:expo-go -w mobile` after dependency changes. It prints the resolved public manifest SDK version as JSON and fails unless it is SDK 54.

`npm audit` still reports advisories through SDK 54's Metro toolchain (`image-size` and `uuid`). The offered fix upgrades to Expo 57, which the App Store Expo Go client cannot run. This throwaway harness accepts that local development-tool exposure on trusted project assets; card captures are processed by service-side Sharp, not Metro. Reassess the advisories when Expo Go supports a patched SDK.

Install once from this directory:

```bash
npm install
cp service/.env.example service/.env
cp mobile/.env.example mobile/.env
openssl rand -hex 32
# copy that new value into both files; create a new value for every service run
```

Set `PROTOTYPE_TOKEN` in `service/.env` and the same `EXPO_PUBLIC_PROTOTYPE_TOKEN` in `mobile/.env`. The service loads `service/.env` for normal start, dev, report, preparation, and selector commands. It refuses to start without the token; non-server CLI commands do not need it.

`HOST=127.0.0.1` is the safe default. For intentional LAN testing set `HOST=0.0.0.0` in `service/.env`, then edit `mobile/.env` to use the computer's LAN address. `localhost` points at the phone and will not work. Allow inbound TCP port 4317 in the computer firewall. HTTP is intentional on a trusted test LAN only. Every data or mutating endpoint requires `Authorization: Bearer <token>`; `/health` is the sole unauthenticated endpoint and reveals no paths or secrets. Native Expo does not require CORS. The service emits no wildcard CORS header; if `PROTOTYPE_BROWSER_ORIGIN` is configured, it allows only that exact origin.

The recognition API accepts exactly three actual JPEG stills and rejects a fourth capture. It checks decoded sizes and JPEG signatures before writing evidence, bounds the full HTTP request, and permits one recognition at a time. Busy recognition requests receive `429`.

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

The optional daily `default_cards` bulk metadata cache is large (up to 2 GB). It is CLI-only and cannot be triggered by an HTTP endpoint. It is not needed for the selected-corpus baseline:

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

1. Confirm `/health` responds. It deliberately does not reveal corpus details.
2. Open the app and grant camera permission. iOS also asks for Local Network access so the app can reach the intentionally configured trusted-LAN service; accept it only for that run.
3. Check the LAN service URL in the app.
4. Put one exact manifest printing on a plain surface in ordinary indoor light. Keep the full card in the centered guide.
5. Select JPEG quality. Start at `0.7`.
6. Tap **Capture 3 stills and recognize**. Review progress, abstention reasons, confidence, and the separate image-only, OCR-only, and hybrid evidence. Hybrid is the default correction proposal. OCR-only abstains rather than inventing evidence when OCR is unavailable.
7. Select a hybrid candidate or paste the correct Scryfall printing ID when it is absent. The displayed five candidates per strategy are not the full corpus. Correct language and finish. Finish starts as `unknown` because prediction is unavailable.
8. Record the outcome before scanning another card. The app disables capture while an unconfirmed response is displayed so no physical evidence is lost. The mobile scan batch remains in memory; the service appends the benchmark outcome under `.prototype-data/`.
9. Swap cards deliberately and repeat. Record full sessions, including abstentions and failures. Do not keep only successful scans.

### Historical kill-test protocol — do not continue this baseline

This protocol is retained for reproducibility, but the baseline has already failed it. Do not proceed to a full corpus with this implementation. The completed run used the ignored owned-card manifest. For a fresh reproduction only, use the checked-in five-card manifest first, or an ignored owned-card manifest after selection. For the five-card preflight, capture each exact printing three times: diffuse light, normal warm indoor light, and one glare-prone angle. Do not proceed to the full sample if the harness crashes, any card never appears in the top three, or fewer than 12 of 15 presentations contain the correct identity in the top three. This small gate only kills a clearly weak still-burst baseline. It does not resolve the ticket or validate auto-accept.

To start the full sample with clean outcomes, archive or remove only `.prototype-data/outcomes.ndjson` and `.prototype-data/reports/`. Never use collection exports as a corpus file.

## Report

Generate a JSON report after outcomes exist:

```bash
npm run report -w @scanner-accuracy/service
# or, replace the sample value with the token from service/.env
curl -H 'Authorization: Bearer your-per-run-token' \
  -X POST http://localhost:4317/reports/generate
```

Reports are written to `.prototype-data/reports/`. They calculate each strategy separately: identity top-1/top-3, `scryfallPrintingAccuracy`, language accuracy, false-auto-accept rate, false auto-accepts per 1,000 presentations, auto-accept coverage, and correction rate for any required identity, printing, language, or finish edit. An abstention is a top-1 failure, but top-3 candidate recall may still count a candidate behind an abstention. Identity uses oracle ID only when both cards provide one; otherwise it uses Scryfall printing ID. False auto-accept includes wrong language. `serviceLatencyMs` is server computation; end-to-end proposal latency starts before the first still and ends after the parsed mobile response. The report gives separate p50/p95 values. Cards/minute sums each session span and excludes gaps between sessions. Finish and physical-variant accuracy are `unavailable`, not zero: the baseline has no finish prediction, and ground truth is never treated as one. Duplicate and missed-change measures are also `unavailable`.

## Decision criteria

The research gate is exact:

- identity top-1 at least 99%;
- Scryfall printing accuracy at least 97%;
- correction rate at most 5%;
- end-to-end proposal latency p95 below 1.5 seconds;
- at least 30 correct cards per minute; and
- an auto-accept threshold whose false-auto-accept upper 95% confidence bound is below 0.5%, reported with its coverage.

Finish may remain behind confirmation if it misses the safety bar. The final study must publish an accuracy/coverage curve, not one threshold.

The currently selected personal corpus has no non-English cards. Language accuracy is therefore an unexercised coverage gap; corpus cards use Scryfall metadata language and deduplicate by Scryfall ID, so this prototype must not claim multilingual support is benchmarked.

This 5/30-card harness does not compute confidence intervals and is not the required representative study. Ticket resolution still requires the research plan's 240 owned physical cards, about 2,880 positive presentations, negative/change events, hard-negative families, sleeves, lighting, languages, finish strata, multiple operators, two iPhones, and two Android phones. Pure-Expo repeated stills also cannot measure live tracking, stable-card latency, duplicate suppression, missed changes, or thermal behavior. **The prototype cannot resolve the ticket until physical evidence is collected.**
