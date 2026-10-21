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
| `detector/frames.py` | The recipe that renders the detector replay frames and clips. |
| `detector/cards.json` | The 30 card printings that the detector replay frames show, 10 for each border colour. |
| `detector/frames.sha256` | The SHA-256 of every rendered detector replay frame, clip frame, and photo, and of `labels.json`. |
| `detector/score.ts` | Scores the detection samples against the true corners, and compares the branch with the merge base. |
| `detector/clips.ts` | Feeds each clip through the automatic capture rule, and scores its settle time, jitter, and photo outline. |
| `detector/geometry.ts` | Maps an outline onto the card in mm, for the frames and the clips. |
| `training-crops/score.py` | The training crop scorer (README, Training crops). |
| `training-crops/fixture-421/` | The 10 training crops of the #421 A/B, in the layout of `crops pull`, with the Scryfall `normal` images of their card printings. |
| `training-crops/test_score.py` | Checks that the scorer reproduces the #421 table on the fixture. |

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

The detector replay measures the card detector on a Mac, with no phone and no hosted access. It runs the shipped detector code on synthetic frames and clips with known corners. It runs the branch and the merge base in the same run, and prints one table that compares them.

What it runs:

1. It renders the frames and the clips from `detector/frames.py` into `modules/card-detector/.data/frames`. It checks every frame, clip frame, photo, and `labels.json` against `detector/frames.sha256`. A frame with another hash fails the replay. It skips the render when the frames are already there and match.
2. It builds the macOS detector command, `card-detector`, on the branch and on the merge base of `HEAD` and `origin/main`. The command is an executable target in `modules/card-detector/Package.swift`. It compiles the Swift files in `ios/Detector` unchanged. When the merge base has no detector command with the `step` mode, the replay builds the branch's command with the merge base's detector files.
3. Both commands start at the same time in the `step` mode. Each reads every frame and every clip frame, and builds the buffer the phone analyzes. The buffer is a full-range `420f` buffer, landscape, with the `.right` orientation, and its colours are converted with BT.709. The replay then asks for one frame at a time, by its index on the command's input. After the index, it sends the frame's intrinsic matrix from `labels.json`, 9 numbers by row, to a command that takes it. The merge base command takes it when its source names `intrinsicMatrix`, from #499 on. The command turns the matrix of the portrait frame into the matrix the camera gives for the landscape buffer, and passes it to the detector, as the camera session does. The command runs the detector on that frame and writes one JSON line: the detection sample fields, with the time of the detector call in `nativeDurationMs`.
4. The replay runs each frame on the merge base and on the branch back to back. It swaps which side goes first on each frame and each round. The first round runs every frame and every clip frame. Two more rounds run the frames again, for Mac timing. So a slow moment on the Mac slows both sides. The card outlines and the clips come from the first round.
5. The scorer compares each card outline with the true corners. It maps the outline onto the card with the homography of the true corners, so every distance is in mm on the card.
6. The scorer feeds the detection samples of each clip, in order, through `observeSample` in `src/scan/capture.ts`, the automatic capture rule that the app runs. It imports the rule and does not copy it.
7. For each clip that asks for a photo, the replay asks each command for the photo outline. It sends the index of the frame of the sample that held still, the photo, and that sample's outline, as one JSON line. The command runs `PhotoOutline.refine`, the photo refinement that `takePhoto` runs on the phone, and writes the photo outline and the outcome. When the merge base's command has no refine mode, its photo outline is the held-still outline. Under the tables, the replay prints the outcomes on each side and the median time of photo refinement on the Mac.

`card-detector frames <image>...` runs the detector once on each frame and writes the same JSON lines, for use by hand.

`card-detector refine <frame> <photo> <outline JSON>` runs photo refinement once, for use by hand. The outline is the held-still outline in fractions of the frame, such as `[{"x":0.2,"y":0.3},{"x":0.7,"y":0.3},{"x":0.7,"y":0.7},{"x":0.2,"y":0.7}]`. It writes one JSON line with the photo outline, the outcome, and `durationMs`.

The frames:

- `detector/cards.json` lists 30 Scryfall card printings: 10 with a black border, 10 with a white border, and 10 borderless, from Scryfall's `border_color`. The recipe downloads their `normal` images into `modules/card-detector/.data/images` once. Set `DETECTOR_IMAGES_DIR` to reuse a folder of them.
- Each frame is a portrait frame of 720 x 1280, the analysis size. A camera pose places the card: a tilt angle about a random axis, and a focal length of 880 to 1000 px. The card is 300 to 500 px wide, turned up to 20 degrees, and upside down in 3 of 10 frames. Each frame has a slight blur and sensor noise.
- Each condition has 30 frames in each tilt bucket, 1,080 frames in all. Within a bucket, the frames take the border colours in turn, so each condition, border colour, and tilt bucket has 10 frames.
- `labels.json` holds each frame's true corners in frame pixels, its condition, its card printing and border colour, the tilt and its bucket, and the camera's intrinsic matrix.
- The recipe needs `uv`. It pins `opencv-python-headless` 5.0.0.93 and `numpy` 2.5.3, as `simulate.py` does. Each frame takes its random numbers from its condition and its index, so a new condition leaves the other frames unchanged. It renders the frames in parallel, in about 30 seconds on an Apple M3.

Tilt buckets, in degrees from straight above the card:

| Bucket | Tilt | Frame indices |
| --- | --- | --- |
| `0` | 0 | 0 to 29 |
| `0-7.5` | 0 to 7.5 | 30 to 59 |
| `7.5-15` | 7.5 to 15 | 60 to 89 |
| `15-25` | 15 to 25 | 90 to 119 |

Conditions:

| Condition | What the frame shows |
| --- | --- |
| `plain` | A card on a plain surface with a soft light ramp |
| `patterned` | A card on a patterned surface. Half the surfaces are procedural: high-contrast stripes, checks, a grid like a cutting mat, dots, lines of text, or a clutter of 150 to 300 coloured rectangles. The other half are CC0 photo textures. The pattern lies on the table plane, so it takes the camera pose too. |
| `shadow` | A card on a plain surface with a hard shadow 1.5 to 5 mm to one side |
| `sleeve` | A card in a clear sleeve 0.8 to 1.6 mm larger than the card on each side. The band between the card and the sleeve edge is darker or lighter than the surface. |
| `glare` | A card on a plain surface with a bright glare band across it |
| `motion-blur` | A card on a plain surface, blurred along a line of 6 to 24 px |
| `hand` | A card on a plain surface with a thumb over one corner, 16 to 22 mm wide, with its shadow |
| `empty-plain` | A plain surface with no card |
| `empty-patterned` | A patterned surface with no card |

The photo textures come from [Poly Haven](https://polyhaven.com), which licenses every asset as CC0 ([licence](https://polyhaven.com/license)). `detector/textures.json` lists each texture, its page, its download, and the licence. The recipe downloads them into `modules/card-detector/.data/textures` once. Use only CC0 textures and procedural patterns here. The Describable Textures Dataset, for example, is for research only.

The clips:

- 20 clips, 5 on each of the `plain`, `patterned`, `shadow`, and `sleeve` surfaces. Each clip has 10 frames at the analysis rate, one every 200 ms, and ends with a photo. The camera samples 30 frames a second and the detector analyzes one every 0.19 s or more, so it analyzes every sixth frame.
- A clip renders one scene, the same way as a frame of its condition. Clip 0 to 4 of a condition take the tilt buckets in turn, from `0`, and the border colours in turn, from black. Each clip takes its random numbers from `20261021:<condition>:clip-<index>`.
- The hand path moves the camera. It turns the camera about its centre, so the intrinsic matrix stays the same, and the whole scene moves on the table plane.
  - **Arrival.** The card arrives 25 to 45 mm from where it comes to rest, and slows down until it rests at 600 ms. Arrival frames have motion blur for an exposure of 1/60 s.
  - **Slow drift.** 1 to 8 mm a second in one direction, and up to 1 degree a second of turn, for the whole clip.
  - **Shake.** Two waves of 3 to 10 Hz on each axis: 0.1 to 0.4 mm across the table, and 0.05 to 0.2 degrees of turn.
- The photo is 2268 x 4032, the size of a 12 MP photo with the analysis frame's 9:16 aspect, as `takePhoto` takes it. It is a JPEG at quality 90. It shows the same scene with the hand path at the photo's time.
- The photo comes about 400 ms after the outline holds still. The card rests at 600 ms, so automatic capture sees it hold still from the next frame, at 800 ms. A detector that finds the card on every frame asks for the photo on the frame at 1,200 ms. The photo comes 100 to 300 ms after that frame.
- The photo has a fixed time. When a detector asks for the photo later, the replay still scores its outline on this photo.
- `labels.json` holds each clip under `clips`: its condition, card printing, border colour, tilt, the time the card rests, and for each frame and the photo, the file, the time, the true corners, and the intrinsic matrix. The photo also has its width and height.

Metrics and pass bars, from #493:

| Metric | What it counts | Bar against the merge base |
| --- | --- | --- |
| Detection rate | Frames with a correct outline over frames with a card. A correct outline has all four corners within 1 mm of the true corners. | Not lower by more than 1 frame in 30 |
| Wrong outlines | Card outlines that are not correct | Not more than the merge base |
| Corner error | The largest corner distance in mm on the card, median and p90 of the correct outlines. Wrong outlines have their own bar. | Median not worse by more than 0.1 mm. p90 not worse by more than 0.5 mm. |
| Inside outlines | Card outlines with a side more than 1 mm inside the card edge | Not more than the merge base plus 1 frame in 30 |
| Size error | The mean of opposite sides in mm, median of the detected frames. Inside is positive, as in #421. | Reported |
| False outlines | Card outlines on empty frames | Zero |
| Mac timing | The median time of the detector call on each frame over the 3 rounds, then the p95 over every frame. Same Mac, same run. | At most 1.2 times the merge base. It is a proxy only: the 20 ms bar is on the iPhone. |
| Same detector code | When the branch and the merge base have the same detector files and command, every number except timing must match | Same numbers |

Clip metrics and pass bars, from #493. Each bar applies to the 5 clips of a condition:

| Metric | What it counts | Bar against the merge base |
| --- | --- | --- |
| Photo asked for | Clips on which automatic capture asks for a photo | Not fewer |
| Settle time | The time from the card's arrival, the first frame, until automatic capture asks for a photo. Median of the clips that ask. | Not worse |
| Jitter | On the frames from the time the card rests, the standard deviation of each corner's error in mm on the card. A clip's jitter is its largest corner. Median of the clips with 2 or more detected frames at rest. | Not worse, to 0.01 mm |
| Photo outline | The corner error of the outline that straightens the photo: the photo outline from the command's refine mode, in fractions of the photo. On a merge base with no refine mode, it is the outline of the sample that held still, the one automatic capture asked the photo for. Median of the clips that ask. | Median not worse by more than 0.1 mm |
| Photo outline, held still on the card edge | The photo outline on the clips whose held-still outline is within 0.5 mm of the card edge on its own frame. On these clips, the photo outline error before photo refinement comes from hand movement. Median of those clips. | Median below 0.5 mm |
| Inside photo outlines | Photo outlines with a side more than 1 mm inside the card edge on the photo | No new one |
| Hand shift | The photo outline error if that sample's outline were on the true corners. It is how far the hand moved the card between that frame and the photo. | Reported |

The bars apply to each condition and tilt bucket, so an average over the tilt buckets cannot hide a regression. The table has one row for each, with the merge base and the branch side by side. The clips table has one row for each clip condition. Two more tables report each metric by condition and border colour, and by border colour and tilt bucket. They have no bars of their own.

The replay writes `base.json`, `branch.json`, and `comparison.md` to `modules/card-detector/.data/reports`. Under the tables, it lists each new inside outline, for information, and each false outline, with its tilt bucket and border colour, the outline's corners in frame pixels, and how far each side is inside the card edge. It also names each clip that asks for a photo on the merge base and not on the branch. It exits 0 when every bar passes, and 1 when a bar fails or a frame hash differs.

Options:

- `--base <ref>` compares with the merge base of `HEAD` and another ref, such as a spec's integration branch.
- `--rounds <n>` runs every frame `n` times on each side, and every clip frame once. The default is 3. One round is enough to check the outlines, but its timing is noisy.
- `--record-frame-hashes` renders the frames again and writes `detector/frames.sha256`. Use it only when the recipe or the card list changes, and say why in the pull request.

Result on `main` at `a6fcfaf`, on an Apple M3 with macOS 27.0.1. It shows the known weak spots of the card detector:

- **Inside outlines rise with tilt.** On black-bordered cards, over every condition, there are 3 inside outlines in 70 frames at no tilt, 12 at up to 7.5 degrees, 17 at 7.5 to 15 degrees, and 39 at 15 to 25 degrees. White-bordered cards rise the same way. Over all inside outlines, 9 in 10 sit 2.9 mm or more inside the card edge, so they are not small fit errors.
- **Sleeves.** The outline sits on the sleeve edge. Up to 15 degrees of tilt, the size error is -0.7 to -1.1 mm, so the outline is larger than the card by about the sleeve margin.
- **Patterned surfaces.** 61 of 120 frames are detected, against 82 of 120 on plain surfaces. For black and white borders it is 56 of 80, against 73 of 80.
- **Borderless cards** are missed on every surface: 9 of 40 detected on plain surfaces. The bottom edge of a borderless card is dark, so its step has the other polarity from the other three edges, and the edge refiner refuses the outline.
- **Hard shadows** put the outline off the card edge at no tilt: a median corner error of 2.6 mm.
- **No false outlines** on the 240 empty plain and patterned frames.
- On plain frames at no tilt, the median corner error is 0.01 mm and the p90 0.07 mm.
- **Hand movement before the photo.** 16 of 20 clips ask for a photo, all at 1,200 ms except one sleeve clip at 1,800 ms. The hand moves the card 0.3 to 2.1 mm between the sample that held still and the photo, 0.9 mm at the median. On the 7 clips whose held-still outline sits on the card edge, the photo outline error is that shift: 0.2 to 1.7 mm. #421 measured shifts of 0.1 to 4.8 mm on the phone. The photo outline median is 0.83 mm on plain clips, 1.04 mm on patterned, 1.45 mm on shadow, and 2.79 mm on sleeve clips, where the outline is also on the sleeve edge.
- **Clips that never ask for a photo.** 1 plain, 2 patterned, and 1 shadow clip. 3 of the 4 show a borderless card.
- Jitter is 0.06 mm or less at the median on each surface.
- Mac timing p95 is about 5 ms. The whole replay takes about 2.5 minutes from nothing, once the card images are downloaded, and about 70 seconds when the frames are already rendered. The clips add the 20 photos at 2268 x 4032. With them, one run from nothing took 3 minutes 38 seconds on the M3 while other work ran on it. The frames, clips, and photos take 1.9 GB on disk.
- Timing noise: with the same detector code on both sides, the timing ratio stayed between 0.96 and 1.04 over 10 runs of 3 rounds on a busy M3, and the same with 5 rounds. One pass with the merge base first and the branch second gave 0.71 to 1.70 on the same Mac. These runs used the first 60 frames.

Photo refinement (#500), on the same Mac, against the integration branch at `1e68ee5`:

- 16 clips ask for a photo. 15 photo outlines pass both checks. The motion check refuses one, on a sleeve clip at 15 to 25 degrees of tilt, where the refined outline moved out to the sleeve edge. That clip keeps its held-still outline.
- The photo outline median falls from 0.83 to 0.03 mm on plain clips, 1.04 to 0.06 mm on patterned, 1.45 to 0.03 mm on shadow, and 2.79 to 1.96 mm on sleeve clips. On sleeve clips, the outline stays on the sleeve edge.
- On the 7 clips whose held-still outline is on the card edge, the photo outline error was 0.19 to 1.69 mm before, the shift from hand movement. With photo refinement, the median is 0.03 mm on each surface.
- Vision's registration moves the outline to within 0.2 mm of the card on all 20 photos, when the held-still outline is the true card edge.
- One inside photo outline goes away, on a shadow clip. No photo outline is a new inside outline.
- Photo refinement takes 34 to 50 ms at the median on the Mac, most of it in reading the photo and in the registration. The edge refiner takes about 2 ms. The detector's frame loop is unchanged.
- On the `macos-15` runner of the Detector workflow, all 16 photo outlines pass both checks, also on the sleeve clip, and photo refinement takes 76 to 117 ms at the median over two runs. Its photo outline medians are within 0.01 mm of the Mac's.

The refusal limits of `PhotoOutline` come from these runs:

| Check | Refuses | Replay result |
| --- | --- | --- |
| Size check | A refined outline more than 2% narrower or shorter than the moved outline (`sizeShrinkMax`) | The 15 accepted outlines are within 0.4% of the moved outline's size. In a second run that starts each clip from the true card edge, the 3 refined outlines on the inner frame are 6% to 9% smaller, and the size check refuses them. |
| Motion check | A refined outline with a corner more than 2% of the moved outline's short side from the moved outline (`cornerMotionMax`), about 1.3 mm on the card | 14 of the 15 accepted outlines move at most 0.4%. The refused sleeve outline moved 2.9%. In the run from the true card edge, outlines that jump out to a sleeve or shadow edge move 2.9% to 3.7%. |

Synthetic frames do not show what Vision does on real frames (#421). So the replay gates mechanisms and regressions, and the phone confirms real gains.

## GitHub Actions

The Detector workflow runs on pull requests that change the detector module, the files in `detector/`, the automatic capture rule in `src/scan/capture.ts`, `app.json`, or the workflow, and by hand. Its replay job runs `bun run detector:replay` on a `macos-15` runner, with the pull request's base branch as `--base`. Run by hand, it compares with `main`.

- The branch and the merge base run in the same job, so Vision and the hardware are the same on both sides.
- A missed bar fails the job.
- When the runner renders a frame with other bytes than `detector/frames.sha256`, the job fails and names the first such frame. The job checks the hashes on every run, also when it restores the frames from the cache.
- The job writes the table to its job summary, under a "Detector replay" heading.
- It caches the card images by `detector/cards.json`, the textures by `detector/textures.json`, and the rendered frames by `detector/frames.sha256`. A re-run of a pull request skips the download and the render. The workflow does not run on pushes, so pull requests share no cache, and each new pull request renders the frames once.
- On a runner, the detector call on a frame takes 45 to 100 ms, about 5 to 10 times as long as on a busy M3. With the 1,080 frames and the 20 clips, the job takes 8.5 to 12.5 minutes. The timeout is 30 minutes. Most of the job is the detector calls: 3 rounds of the 1,080 frames and one round of the clips, on both sides. Without the cache, the render takes about 1.5 minutes, and saving the 1.9 GB of frames takes 25 to 40 seconds. With the cache, restoring the frames takes about 25 to 40 seconds.
- With the same detector code on both sides, the timing ratio stayed between 0.93 and 1.03 over 13 runs on runners: 7 runs with the first 60 frames, 3 with the 1,080 frames, and 3 with the clips too.

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
