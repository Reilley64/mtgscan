# Scanner evidence pack

This folder holds the evidence for the scanner release gates in #10, #21, and #75. The gates measure the card recognizer module in `modules/card-recognizer`. Every command here runs from `apps/mobile`.

## Contents

| Path | What it is |
| --- | --- |
| `real/crops/` | 261 straightened phone crops at 488 x 680. 250 are cards and 11 are not cards. |
| `real/labels.json` | The true card printing of each card crop and the list of non-card crops. Paths are relative to this file. |
| `real/expected-full.json` | Recorded results on the full gallery. |
| `real/expected-held-out.json` | Recorded results with each true printing removed from the gallery. |
| `real/feature-prints.json` | Feature prints of 24 real crops, recorded on the owner's Mac. The replay compares them with the feature prints of the machine it runs on. |
| `simulated/simulate.py` | The recipe that renders the simulated scans. |
| `simulated/cards.json` | The 3,000 card printings that the simulation renders, in order, with seed and group counts. |
| `simulated/photos.sha256` | The SHA-256 of every rendered photo. |
| `simulated/expected-full.json` | Recorded results on the full gallery, with one row for each scan. |
| `simulated/expected-held-out.json` | Recorded results with each true printing removed. It lists every accept. |
| `bin-deck/test-deck.tsv` | The fixed 30-card test deck, with the three corrected printings from #10. |
| `bin-deck/<run>/` | The summary, results, and per-card detail of each physical run cited in #21. |
| `check.mjs` | Compares a new result with an expected file and checks the gates. |

Each expected file has a `recordedWith` block. It names the recognizer commit, the feature print, the gallery, the machine, and the command.

The crops show only cards, the card holder, and fingers. The 250 card crops cover 62 printings from one phone. They come from the bin rounds in #20 (`crops/rectified/`), the Mac recognizer rounds in #21 slice 1 (`crops/catalog/`), and the phone rounds in #21 slice 2 (`crops/catalog-device/`).

## Gallery

The gates need the gallery: the feature prints and the printing list of every paper card printing. It is not in the repo, because it is built from Scryfall data. The expected files were recorded with gallery version `20261012-cf1753`, the first int8 gallery that #79 built for phones. It has 102,730 card printings from Scryfall `default_cards` of 11 October 2026. `recordedWith` names the version and the SHA-256 values of the installed `catalog.json` and `gallery.f16`. The scanner evidence pack keeps this version in Storage: `bun run gallery publish` never deletes it.

`bun run gallery install <version>` in `supabase` unpacks a gallery version into `installed/<version>` in its work folder. The folder holds `catalog.json`, `gallery.json`, `gallery.f16`, and the compiled model `model.mlmodelc`. Set `RECOGNIZER_GALLERY_DIR` to that folder. The replay stops when the variable is not set.

- **Install the recorded gallery.** Run `bun --env-file=.env.hosted gallery/main.ts install 20261012-cf1753 --hosted` in `supabase`. It unpacks the gallery into `~/Library/Caches/mtgscan/gallery/installed/20261012-cf1753`, with the same decoder as the phone. It downloads the parts with the hosted secret key only when they are not on the Mac. Only this gallery can show that a result is unchanged against the expected files. The recorded gallery is gallery format 1, and `install` now takes only format 2, so it refuses the recorded gallery. The recorded gallery has no model, so the recognizer no longer loads it, and the replay cannot run until #471 records the evidence pack again against the first PE-Core gallery version. Keep the folder that an earlier `install` wrote until then.
- **Build a gallery.** You can build a gallery from the current Scryfall data with the same commands as the gallery that phones download. They run against your local Supabase stack. Start the stack, and run these commands in `supabase`. The API port is 54321 on the default stack.

  ```bash
  export SUPABASE_URL=http://127.0.0.1:<API port>
  export SUPABASE_SECRET_KEY=$(bunx supabase@2.120.0 status -o json | jq -r .SECRET_KEY)
  bun run import catalog
  bun run gallery build
  bun run gallery install <version>
  ```

  `import catalog` imports the current Scryfall card catalog into the local stack. `gallery build` keeps the paper card printings in the card catalog. It downloads the missing `normal` images into `~/Library/Caches/mtgscan/scryfall-images`. The full card catalog needs about 10 GB of images. The build needs the converted model in `~/Library/Caches/mtgscan/models` (README, Feature print model). It computes the int8 feature prints with that model and puts the model part in the gallery version, as for the gallery that phones download. Its work folder is `~/Library/Caches/mtgscan/local-gallery`, apart from the work folder of the owner's hosted builds. It uploads a gallery version to local Storage. It never publishes the version. `install` unpacks the version into `~/Library/Caches/mtgscan/local-gallery/installed/<version>`, with the same decoder as the phone. A gallery from newer Scryfall data has more card printings, so a few results can change.

  Never load `.env.hosted` or pass `--hosted` to build a gallery for the replay. Without `--hosted`, the gallery commands refuse every Supabase URL except the local stack.

The macOS recognizer command computes the feature prints. It compiles the same Swift files as the phone module. On the owner's Mac it gives the same feature prints as the recorded gallery.

## Replay

```bash
bun run recognizer:test
bun run recognizer:replay
```

`recognizer:test` runs the Swift fixture tests with the fixture model: the collector-line parser, the gallery key, the outline order, the gallery install, and recognition. `recognizer:replay` builds the macOS recognizer command and runs the Mac gates. It first checks the feature prints:

- **Feature prints.** It compares the feature prints of the 24 references in `real/feature-prints.json` with the feature prints that the gallery's model makes on this machine. It fails when the lowest cosine is below 0.98.
- **Gate 1: real crops.** The 250 card crops and 11 non-card crops, on the full gallery and with each true printing held out.
- **Gate 2: simulated scans.** It renders the 3,000 scans from the recipe into `modules/card-recognizer/.data/simulated` and checks every photo against `simulated/photos.sha256`. A photo with another hash fails the replay. It skips the render when the photos are already there and match. It then runs the scans on the full gallery and held out.

Gate 3 runs on the phone, not on the Mac.

Options:

- `--real-only` skips the simulated scans.
- `--baseline <reports-dir>` compares each result with the result of an earlier replay instead of the expected files.
- `--record-feature-prints` records `real/feature-prints.json` again on this machine, with the model of the gallery in `RECOGNIZER_GALLERY_DIR`. Its `recordedWith` block names the model and its SHA-256.
- `--webp-round-trip` also runs Gate 1 on two re-encoded copies of the real crops. The recognizer command (`reencode`) writes them into `modules/card-recognizer/.data/round-trip`:
  - `webp`: each crop as a training crop, a 488 x 680 WebP at quality 90, with the same encoder as the phone;
  - `jpeg`: each crop as the old training crop, a JPEG at quality 0.9 written with ImageIO.

  No lossy re-encode gives the same answer on every crop, because the collector line is only a few pixels high. So the WebP run passes when it makes no wrong accept and rejects every non-card crop, on the full gallery and held out. The summary shows its correct accepts next to the JPEG run's, but they do not pass or fail it. The summary shows both runs under `webpRoundTrip`, with the scans whose first candidate or accept changed from the original crops. The results are in the reports folder as `real-full-webp.json`, `real-full-jpeg.json`, `real-held-out-webp.json`, and `real-held-out-jpeg.json`. The crops in this pack stay JPEG.

The render needs `uv`. `simulate.py` pins `opencv-python-headless` 5.0.0.93 and `numpy` 2.5.3, because another version changes the photo bytes. It downloads the 3,000 Scryfall `large` images into `modules/card-recognizer/.data/large` once. Set `RECOGNIZER_LARGE_IMAGES_DIR` to reuse a folder of them. On an Apple M3 the render takes about 45 minutes, the real crops about 30 seconds, and each simulated run about 5 minutes.

The replay writes every result and its `check.mjs` report to `modules/card-recognizer/.data/reports`. It prints a summary and exits with the worst code:

- 0: every gate passes and nothing changed.
- 2: every gate passes, but some results changed. Explain every change before you accept it.
- 1: a gate failed.

`check.mjs` compares one result with one expected file:

```bash
bun test/scanner-evidence/check.mjs <expected.json> <actual.json> <gallery-dir>
```

It reports every measure and every scan whose first candidate or accept changed. A non-card scan compares only its accept, because a not-a-card result has no candidates.

## Gate 1: real crops

This gate shows that the recognizer never accepts a wrong card or a wrong printing on real phone crops. It also shows that it rejects non-card crops. The held-out run shows what happens when a printing is missing from the gallery.

Pass criteria:

- 0 wrong-card accepts.
- 0 wrong-printing accepts on the full gallery.
- 0 accepts with the true printing missing.
- 11 of 11 non-card crops rejected.
- 0 recognizer errors.

Recorded result: 214 correct accepts of 250, 0 false accepts, 249 right cards first, and 236 right printings first. With the true printing missing, 0 accepts.

## Gate 2: simulated scans

This gate estimates the wrong-card rate on 3,000 scans, far more than a physical deck allows. The scans are synthetic phone photos rendered from Scryfall `large` images, a different file from the gallery's `normal` images.

`cards.json` was chosen by `simulate.py` with seed 20261008 and the default counts: 1,500 same-art reprints, 800 single-art printings, 400 Secret Lair and special frames, and 300 pre-2015 frames. The bulk file was Scryfall `default_cards` of 6 October 2026. This command chooses the same list from that file:

```bash
uv run test/scanner-evidence/simulated/simulate.py --bulk <default-cards.jsonl.gz> --images <dir> --output <dir> --save-cards <cards.json>
```

Pass criteria:

- 0 wrong-card accepts on the full gallery and with the true printing missing.
- No more accepted wrong printings outside the candidate list than recorded. The recorded count is 0. The #10 study had 1, Tamiyo's Journal `plst SOI-265` with 10 printings that share its art. The candidate list now includes every same-text twin, so that card is inside it.
- 0 recognizer errors.

Recorded result on the full gallery: 2,493 accepts, 2,135 exactly right, 358 other printings of the right card, and 0 wrong cards. 2,993 of 3,000 had the right card first. With the true printing missing: 382 accepts, all a printing that shares the art of the missing printing or its promo, and 0 wrong cards.

In the results, `falseAccepts` counts every accept that is not the exact printing. Most are same-text twins, which are the product decision in #10. `check.mjs` reports wrong cards separately. `truthInTop5` counts the scans whose true printing is anywhere in the candidate list.

## Gate 3: bin deck on the phone

This gate measures the whole phone path on physical cards: capture, recognition on the phone, and latency. It needs the iPhone and the 30 cards in `bin-deck/test-deck.tsv`.

The run uses a development build of the app on the iPhone, with Metro on the Mac:

1. Start Metro with its output in a log file.
2. Tap **Run the parity check** in settings. Record the result with `bun --env-file=.env.hosted gallery/main.ts parity <version> --hosted` in `supabase` (README, Gallery build and publish).
3. Scan the 30 cards with the torch off, one at a time, in the order of `test-deck.tsv`. Do not fix any scan.
4. Score the run from `apps/mobile`: `bun run bin-deck:score <metro-log> <run> --device <model> --ios <version>`. It reads the `PARITY` and `RECOGNITION` lines from the log and writes `summary.md`, `results.env`, `bin-batch-summaries.ndjson`, and `batch-1-detail.ndjson` to `bin-deck/<run>/`. It exits 1 when a gate fails.

The script gives each recognition to the next card of the test deck, in deck order. A photo that is not a card is counted apart. A recognition whose first candidate repeats the card before is a duplicate photo. A duplicate photo accepted as another card printing is a false accept. A skipped card shifts every later card, so the gates fail instead of passing by mistake. Keep the four files of each run. Do not keep logs.

The cited runs used the native preview app on the `prototype/first-release` branch (`npm run physical-run:device-bin` in `prototypes/native-preview-scanner`).

Pass criteria from #10 and #21:

- 0 false accepts.
- The right card first for at least 29 of 30.
- The exact card printing first for at least 27 of 30. The other cards abstain or show a switchable same-text twin.
- End-to-end p95 below 1.5 s.
- Gallery parity on the phone: the lowest cosine is at least 0.98 over 24 reference images (`DEVICE_PARITY`). `bun run gallery parity` checks this rule when it records the parity check. The score script copies the `PARITY` line into `DEVICE_PARITY`.

Cards per minute is not a recognition gate. It moved to #11.

Cited runs, all on an iPhone 16e with iOS 26.6.1 and the torch off:

| Run | Commit | Recognizer | Right card | Right printing | Correct accepts | False accepts | End-to-end p95 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `20261008-115755` | `713e858` | Mac | 3 | 3 | 0 | 0 | 1,359 ms |
| `20261008-122110` | `d7e7606` | Mac | 29 | 28 | 21 | 0 | 1,724 ms |
| `20261008-123021` | `d7d2d46` | Mac | 30 | 29 | 26 | 0 | 1,334 ms |
| `20261008-131416` | `2b6e4a4` | Phone | 29 | 27 | 26 | 0 | 1,164 ms |
| `20261008-133032` | `63d4d15` | Phone | 30 | 28 | 26 | 0 | 1,185 ms |
| `20261014-bin-deck` | `e9af3d0` | App | 30 | 26 | 13 | 0 | 789 ms |
| `20261015-bin-deck` | `ab2443c` | App | 29 | 28 | 25 | 0 | 722 ms |

The first run had a bug that turned every card 90 degrees. The #21 resolution uses the last three runs.

`20261014-bin-deck` is the first run in the app (#84), with gallery version `20261012-cf1753`. It ran in low light on a textured surface. It accepted no wrong card. The collector line was not read on 11 cards, so 17 cards abstained, and the exact card printing was first for 26 of 30, one below the gate. Six cards were captured only after the owner moved them to a smoother surface.

`20261015-bin-deck` is the rerun in good light on the same table (#165), with the same gallery version. It passes every gate. 25 cards were accepted correctly and 5 abstained. The phone read the full collector line on 23 cards. It read Big Score `SLD 7096` as `SLD 1096`, so the recognizer abstained and showed Sword of Truth and Justice `SLD 1096` first, with Big Score second. That is the only card whose first candidate was another card. Since #206, a collector line that names a card the image does not support shows the image's top card printing first, and the card printing that the reading names stays among the candidates. The camera captured two foil Secret Lair cards, `SLD 7096` and `SLD 7094`, only after the owner moved them to the bin.

## GitHub Actions

The Recognizer workflow runs on pull requests that change the recognizer module, this evidence pack, or the workflow, and by hand. It has one job.

- **Module job.** It generates the iOS project and builds the app with the recognizer module for the iOS Simulator. This checks Swift 6 strict concurrency with Xcode 26.3 and Expo SDK 58.

CI does not replay the evidence pack. A GitHub macOS runner needs about 4 hours to build a gallery, its feature prints differ slightly from the owner's Mac, and the phone uses the gallery built on the owner's Mac. So the replay is a local gate.

## Local replay before merge

Before you merge a change to the recognizer, this evidence pack, or the gallery, run `bun run recognizer:replay` on the owner's Mac with the recorded gallery, on the branch and on `main` as the baseline. Put the result in the pull request under a "Local recognizer replay" heading: the commands, the gallery, every gate, the wrong-card accepts (must be 0), and each changed result with its reason.

## When the model changes

Record the expected files again when the recognizer code, the model, the operating system, or the gallery changes.

1. Run `bun run recognizer:replay` on the owner's Mac with the recorded gallery.
2. Read each report in `modules/card-recognizer/.data/reports`. Explain every changed scan before you accept it.
3. Do not accept new results that fail a gate.
4. Copy the new result into the `result` field of the expected file.
5. Update the `recordedWith` block: commit, gallery SHA-256 values, machine, and date.

## Limits

- One tester, one phone, and one set of cards.
- The simulation starts from the same scans as the gallery, so the image match is easier than for real photos.
- Foil, wear, ink differences, and capture problems are not simulated.
