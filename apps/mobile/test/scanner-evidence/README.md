# Scanner evidence pack

This folder holds the evidence for the scanner release gates in #10, #21, and #75. The gates measure the card recognizer module in `modules/card-recognizer`. The detector replay (#493) measures the card detector module in `modules/card-detector`. Every command here runs from `apps/mobile`.

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
| `detector/frames.py` | The recipe that renders the detector replay frames. |
| `detector/cards.json` | The 30 card printings that the detector replay frames show, 10 for each border colour. |
| `detector/frames.sha256` | The SHA-256 of every rendered detector replay frame and of its `labels.json`. |
| `detector/score.ts` | Scores the detection samples against the true corners, and compares the branch with the merge base. |

Each expected file has a `recordedWith` block. It names the recognizer commit, the model and its SHA-256, the gallery, the machine, and the command.

The crops show only cards, the card holder, and fingers. The 250 card crops cover 62 printings from one phone. They come from the bin rounds in #20 (`crops/rectified/`), the Mac recognizer rounds in #21 slice 1 (`crops/catalog/`), and the phone rounds in #21 slice 2 (`crops/catalog-device/`).

## Gallery

The gates need the gallery: the feature prints and the printing list of every paper card printing. It is not in the repo, because it is built from Scryfall data. The expected files and `real/feature-prints.json` were recorded with gallery version `20261021-c38f43`, the first PE-Core gallery version (#471). Its model is `pe-core-s16-384` with SHA-256 `a7b41405eb0a9b34cebc3acf64c42d4c009689df3686d7f22fc12ea53e521aab`, and its art margin is 0.03. It has 102,857 card printings from Scryfall `default_cards` of 20 October 2026. `recordedWith` names the version, the model, and the SHA-256 values of the installed `catalog.json` and `gallery.f16`. The scanner evidence pack names this version, so `bun run gallery publish` never deletes it from Storage.

The Vision gallery version `20261012-cf1753` recorded the pack before. The pack no longer names it, but `publish` also keeps the previous published version. So the first publish after the switch keeps it, and the second one deletes it.

`bun run gallery install <version>` in `supabase` unpacks a gallery version into `installed/<version>` in its work folder. The folder holds `catalog.json`, `gallery.json`, `gallery.f16`, and the compiled model `model.mlmodelc`. Set `RECOGNIZER_GALLERY_DIR` to that folder. The replay stops with a message when the variable is not set or the folder has no gallery.

- **Install the recorded gallery.** Run `bun --env-file=.env.hosted gallery/main.ts install 20261021-c38f43 --hosted` in `supabase`. It unpacks the gallery and its model into `~/Library/Caches/mtgscan/gallery/installed/20261021-c38f43`, with the same decoder as the phone. It downloads the parts with the hosted secret key only when they are not on the Mac. Only this gallery can show that a result is unchanged against the expected files.
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

Recorded result: 207 correct accepts of 250, 0 false accepts, 248 right cards first, and 230 right printings first. 15 accepts are unread, accepted as the only printing of their art. With the true printing missing, 0 accepts. The last Vision recording, on macOS 15.7.3, had 214 correct accepts, 249 right cards first, and 236 right printings first. On macOS 27.0.1 the Vision gallery gets 206 correct accepts, so most of the drop comes from the collector line reader on the new OS.

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

Recorded result on the full gallery: 2,504 accepts, 2,134 exactly right, 370 other printings of the right card, and 0 wrong cards. 2,996 of 3,000 had the right card first. With the true printing missing: 401 accepts, all another printing of the right card, and 0 wrong cards. The last Vision recording had 2,493 accepts, 2,135 exactly right, and 2,993 right cards first, and 382 accepts with the true printing missing.

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

## Detector replay

```bash
bun run detector:test
bun run detector:replay
```

The detector replay measures the card detector on a Mac, with no phone and no hosted access. It runs the shipped detector code on synthetic frames with known corners. It runs the branch and the merge base in the same run, and prints one table that compares them.

What it runs:

1. It renders the frames from `detector/frames.py` into `modules/card-detector/.data/frames`. It checks every frame and `labels.json` against `detector/frames.sha256`. A frame with another hash fails the replay. It skips the render when the frames are already there and match.
2. It builds the macOS detector command, `card-detector`, on the branch and on the merge base of `HEAD` and `origin/main`. The command is an executable target in `modules/card-detector/Package.swift`. It compiles the Swift files in `ios/Detector` unchanged. When the merge base has no detector command with the `step` mode, the replay builds the branch's command with the merge base's detector files.
3. Both commands start at the same time in the `step` mode. Each reads every frame and builds the buffer the phone analyzes. The buffer is a full-range `420f` buffer, landscape, with the `.right` orientation, and its colours are converted with BT.709. The replay then asks for one frame at a time, by its index on the command's input. The command runs the detector on that frame and writes one JSON line: the detection sample fields, with the time of the detector call in `nativeDurationMs`.
4. The replay runs each frame on the merge base and on the branch back to back. It swaps which side goes first on each frame and each round, and it runs every frame 3 times. So a slow moment on the Mac slows both sides. The card outlines come from the first round.
5. The scorer compares each card outline with the true corners. It maps the outline onto the card with the homography of the true corners, so every distance is in mm on the card.

`card-detector frames <image>...` runs the detector once on each frame and writes the same JSON lines, for use by hand.

The frames:

- `detector/cards.json` lists 30 Scryfall card printings: 10 with a black border, 10 with a white border, and 10 borderless. The recipe downloads their `normal` images into `modules/card-detector/.data/images` once. Set `DETECTOR_IMAGES_DIR` to reuse a folder of them.
- Each frame is a portrait frame of 720 x 1280, the analysis size. A camera pose places the card. The camera looks straight down at the card, with a focal length of 880 to 1000 px. The card is 300 to 500 px wide, turned up to 20 degrees, and upside down in 3 of 10 frames. Each frame has a slight blur and sensor noise.
- Conditions: `plain` is a card on a plain surface, and `empty-plain` is a plain surface with no card. Each has 30 frames. The plain frames take the border colours in turn.
- `labels.json` holds each frame's true corners in frame pixels, its condition, its card printing and border colour, the tilt, and the camera's intrinsic matrix.
- The recipe needs `uv`. It pins `opencv-python-headless` 5.0.0.93 and `numpy` 2.5.3, as `simulate.py` does. Each frame takes its random numbers from its condition and its index, so a new condition leaves the other frames unchanged.

Metrics and pass bars, from #493:

| Metric | What it counts | Bar against the merge base |
| --- | --- | --- |
| Detection rate | Detected frames over frames with a card, per condition | Not lower by more than 1 frame in 30 |
| Corner error | The largest corner distance in mm on the card, median and p90 of the detected frames | Median not worse by more than 0.1 mm. p90 not worse by more than 0.5 mm. |
| Inside outlines | Card outlines with a side more than 1 mm inside the card edge | No new one on any frame |
| Size error | The mean of opposite sides in mm, median of the detected frames. Inside is positive, as in #421. | Reported |
| False outlines | Card outlines on empty frames | Zero |
| Mac timing | The median time of the detector call on each frame over the 3 rounds, then the p95 over every frame. Same Mac, same run. | At most 1.2 times the merge base. It is a proxy only: the 20 ms bar is on the iPhone. |
| Same detector code | When the branch and the merge base have the same detector files and command, every number except timing must match | Same numbers |

The replay writes `base.json`, `branch.json`, and `comparison.md` to `modules/card-detector/.data/reports`. Under the table, it lists each new inside outline and each false outline, with the outline's corners in frame pixels and how far each side is inside the card edge. It exits 0 when every bar passes, and 1 when a bar fails or a frame hash differs.

Options:

- `--base <ref>` compares with the merge base of `HEAD` and another ref, such as a spec's integration branch.
- `--rounds <n>` runs every frame `n` times on each side. The default is 3. One round is enough to check the outlines, but its timing is noisy.
- `--record-frame-hashes` renders the frames again and writes `detector/frames.sha256`. Use it only when the recipe or the card list changes, and say why in the pull request.

Result on `main` at `a6fcfaf`, on an Apple M3 with macOS 27.0.1:

- Plain: 22 of 30 detected. The 8 misses are borderless cards. The bottom edge of a borderless card is dark, so its step has the other polarity from the other three edges, and the edge refiner refuses the outline.
- Corner error median 0.01 mm, p90 0.07 mm.
- 1 inside outline: `plain-018.png`, a black-bordered card outlined on its inner frame, 2.6 to 6.7 mm inside.
- 0 false outlines on the empty plain frames.
- Mac timing p95 about 3.5 ms. The replay takes about 20 seconds once the images are downloaded.
- Timing noise: with the same detector code on both sides, the timing ratio stayed between 0.96 and 1.04 over 10 runs of 3 rounds on a busy M3, and between 0.96 and 1.04 with 5 rounds. One pass with the merge base first and the branch second gave 0.71 to 1.70 on the same Mac.

Synthetic frames do not show what Vision does on real frames (#421). So the replay gates mechanisms and regressions, and the phone confirms real gains.

## GitHub Actions

The Detector workflow runs on pull requests that change the detector module, the files in `detector/`, `app.json`, or the workflow, and by hand. Its replay job runs `bun run detector:replay` on a `macos-15` runner, with the pull request's base branch as `--base`. Run by hand, it compares with `main`.

- The branch and the merge base run in the same job, so Vision and the hardware are the same on both sides.
- A missed bar fails the job.
- The job writes the table to its job summary, under a "Detector replay" heading.
- It caches the card images by `detector/cards.json`, and the rendered frames by `detector/frames.sha256`. A re-run of a pull request skips the download and the render. The workflow does not run on pushes, so pull requests share no cache, and each new pull request renders the frames once.
- On a runner, the detector call takes 60 to 100 ms, about 20 times as long as on an M3. With 60 frames the job takes about 1.5 minutes, of which the render takes 11 seconds. With the same detector code on both sides, the timing ratio stayed between 0.93 and 1.03 over 7 runs.

A pull request that changes the card detector shows the replay table under a "Detector replay" heading. Copy the table from the job summary of its last run, and link the run.

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
5. Update the `recordedWith` block: commit, model and its SHA-256, gallery SHA-256 values, machine, and date.

## Limits

- One tester, one phone, and one set of cards.
- The simulation starts from the same scans as the gallery, so the image match is easier than for real photos.
- Foil, wear, ink differences, and capture problems are not simulated.
