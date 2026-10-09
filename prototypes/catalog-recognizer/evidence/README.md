# Scanner evidence pack

This folder holds the evidence for the scanner release gates in issues #10 and #21. Each gate can be re-run from the repo. All commands run from `prototypes/catalog-recognizer`.

The folder sits next to the catalog recognizer because every gate here measures that recognizer, and its scripts read these files.

## Contents

| Path | What it is |
| --- | --- |
| `real/crops/` | 261 straightened phone crops at 488 x 680. 250 are cards and 11 are not cards. |
| `real/labels.json` | The true printing of each card crop and the list of non-card crops. Paths are relative to this file. |
| `real/expected-full.json` | Recorded results on the full catalog. |
| `real/expected-held-out.json` | Recorded results with each true printing removed from the catalog. |
| `simulated/cards.json` | The 3,000 printings that the simulation renders, in order, with seed and group counts. |
| `simulated/photos.sha256` | The SHA-256 of every rendered photo. |
| `simulated/expected-full.json` | Recorded results on the full catalog, with one row for each scan. |
| `simulated/expected-held-out.json` | Recorded results with each true printing removed. It lists every accept. |
| `bin-deck/test-deck.tsv` | The fixed 30-card test deck, with the three corrected printings from #10. |
| `bin-deck/<run>/` | The summary, results, and per-card detail of each physical run cited in #21. |
| `check.mjs` | Compares a new result with an expected file and checks the gates. |

Each expected file has a `recordedWith` block. It names the recognizer commit, the feature print model, the gallery, the machine, and the exact command.

## Where the crops come from

The crops were copied from ignored folders under `prototypes/scanner-accuracy/.prototype-data/`. The folder names are kept.

- `crops/rectified/`: 157 card crops and 11 non-card crops from the bin rounds in #20. Every label was checked against the printed collector line.
- `crops/catalog/`: 30 crops from the Mac recognizer rounds in #21 slice 1.
- `crops/catalog-device/`: 63 crops from the phone rounds in #21 slice 2.

The crops show only cards, the card holder, and fingers. The 250 card crops cover 62 printings from one phone.

## Recognizer and model

The expected results come from the recognizer source at commit `83988dd`. The source last changed in `716a44f`.

- Feature print: `VNGenerateImageFeaturePrintRequest` revision 2, `scaleFill`, 768 values.
- Gallery: float16 `gallery.f16` over 102,726 paper printings, built on 6 October 2026 from Scryfall `default_cards`.
- Machine: Apple M3, macOS 15.7.3.

The gallery is not in the repo. It is 181 MB and is built from Scryfall data. The `recordedWith` block lists the SHA-256 of `catalog.json`, `gallery.f16`, and the Scryfall bulk file. A rebuilt gallery from a newer bulk file can give slightly different results.

## Setup

```bash
./scripts/build.sh
node scripts/prepare-catalog.mjs
```

To use the exact bulk file of the study, set `SCRYFALL_BULK_FILE` to a copy with SHA-256 `2e4b9449d03162d910226026f278e07ca6f491497fce8f7f5ae56833300c1772`.

## Gate 1: real crops

This gate shows that the recognizer never accepts a wrong card or a wrong printing on real phone crops. It also shows that it rejects non-card crops. The held-out run shows what happens when a printing is missing from the gallery.

```bash
node scripts/evaluate-crops.mjs evidence/real/labels.json --details --scans > /tmp/real-full.json
node evidence/check.mjs evidence/real/expected-full.json /tmp/real-full.json
node scripts/evaluate-crops.mjs evidence/real/labels.json --held-out --details --scans > /tmp/real-held-out.json
node evidence/check.mjs evidence/real/expected-held-out.json /tmp/real-held-out.json
```

Each run takes about 30 seconds.

Pass criteria:

- 0 wrong-card accepts.
- 0 wrong-printing accepts on the full catalog.
- 0 accepts with the true printing missing.
- 11 of 11 non-card crops rejected.
- 0 recognizer errors.

Recorded result: 214 correct accepts of 250, 0 false accepts, 247 right names first, and 234 right printings first. With the true printing missing, 0 accepts.

## Gate 2: simulated scans

This gate estimates the wrong-card rate on 3,000 scans, far more than a physical deck allows. The scans are synthetic phone photos rendered from Scryfall `large` images, a different file from the gallery's `normal` images.

The images are not in the repo. `simulated/cards.json` lists the printings and their image links, so the same 3,000 scans can be rendered again:

```bash
uv run eval/simulate.py --cards evidence/simulated/cards.json --images .data/large --output .data/simulated
(cd .data/simulated && shasum -a 256 -c ../../evidence/simulated/photos.sha256 --quiet)
node scripts/evaluate-crops.mjs .data/simulated/labels.json --details --scans > /tmp/simulated-full.json
node evidence/check.mjs evidence/simulated/expected-full.json /tmp/simulated-full.json
node scripts/evaluate-crops.mjs .data/simulated/labels.json --held-out --details > /tmp/simulated-held-out.json
node evidence/check.mjs evidence/simulated/expected-held-out.json /tmp/simulated-held-out.json
```

Rendering takes a few minutes and downloads 3,000 images once. Each evaluation takes about 7 minutes. The seed is 20261008, the `simulate.py` default.

`cards.json` was chosen by `simulate.py` with seed 20261008 and the default counts: 1,500 same-art reprints, 800 single-art printings, 400 Secret Lair and special frames, and 300 pre-2015 frames. The bulk file was Scryfall `default_cards` of 6 October 2026, with the SHA-256 above. This command chooses the same list from that file:

```bash
uv run eval/simulate.py --bulk <default-cards.jsonl.gz> --images .data/large --output .data/simulated --save-cards /tmp/cards.json
```

The SHA-256 check passed with `opencv-python-headless` 5.0.0 and `numpy` 2.5.3. Another OpenCV version can change the photo bytes. If the check fails, the recognizer results can still differ only a little, but the scans are not the same.

Pass criteria:

- 0 wrong-card accepts on the full catalog and with the true printing missing.
- No more accepted wrong printings outside the candidate list than recorded. The recorded count is 0. The #10 study had 1, Tamiyo's Journal `plst SOI-265` with 10 same-art twins. The candidate list now includes every same-text twin, so that card is inside it.
- 0 recognizer errors.

The full-catalog expected file was recorded in six runs of 500 scans and merged. Its accepts match the single study run cited in #10.

Recorded result on the full catalog: 2,493 accepts, 2,135 exactly right, 357 same-text twins that the top 5 can switch, 1 wrong printing outside the top 5, and 0 wrong cards. 2,962 of 3,000 had the right name first. With the true printing missing: 382 accepts, all a same-art or promo twin of the missing printing, and 0 wrong cards.

In the results, `falseAccepts` counts every accept that is not the exact printing. Most are same-text twins, which are the product decision in #10. `check.mjs` reports wrong cards separately.

## Gate 3: bin deck on the phone

This gate measures the whole phone path on physical cards: capture, recognition on the phone, and latency. It needs the iPhone, the 30 cards in `bin-deck/test-deck.tsv`, and the native preview app.

```bash
cd ../native-preview-scanner
npm run physical-run:device-bin
```

The run writes `.physical-runs/<run>/` with `summary.md`, `results.env`, `bin-batch-summaries.ndjson`, and `batch-1-detail.ndjson`. Copy those four files into `bin-deck/<run>/` to keep the run. Do not copy `metro.log` or `service.log`. Replace the LAN address in `RECOGNITION_URL`.

Pass criteria from #10 and #21:

- 0 false accepts.
- Identity top-1 of at least 29 of 30.
- Exact printing top-1 of at least 27 of 30. The other cards abstain or show a switchable same-text twin.
- End-to-end p95 below 1.5 s.
- Gallery parity on the phone: the lowest cosine is at least 0.98 (`DEVICE_PARITY`).

Cards per minute is not a recognition gate. It moved to #11.

Cited runs, all on an iPhone 16e with iOS 26.6.1 and the torch off:

| Run | Commit | Recognizer | Identity | Printing | Correct accepts | False accepts | End-to-end p95 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `20261008-115755` | `713e858` | Mac | 3 | 3 | 0 | 0 | 1,359 ms |
| `20261008-122110` | `d7e7606` | Mac | 29 | 28 | 21 | 0 | 1,724 ms |
| `20261008-123021` | `d7d2d46` | Mac | 30 | 29 | 26 | 0 | 1,334 ms |
| `20261008-131416` | `2b6e4a4` | Phone | 29 | 27 | 26 | 0 | 1,164 ms |
| `20261008-133032` | `63d4d15` | Phone | 30 | 28 | 26 | 0 | 1,185 ms |

The first run had a bug that turned every card 90 degrees. The #21 resolution uses the last three runs.

## When the model changes

Regenerate the expected files when the recognizer code, the feature print revision, the operating system, or the gallery changes.

1. Run the gate commands above and write the output to a temporary file.
2. Read the `check.mjs` report. Explain every changed scan before you accept it.
3. Do not accept new results that fail a gate.
4. Copy the new result into the `result` field of the expected file.
5. Update the `recordedWith` block: commit, gallery SHA-256 values, machine, and date.

Exit code 0 means the gates pass and nothing changed. Exit code 2 means the gates pass but some results changed. Exit code 1 means a gate failed.

## Limits

- One tester, one phone, and one set of cards.
- The simulation starts from the same scans as the gallery, so the image match is easier than for real photos.
- Foil, wear, ink differences, and capture problems are not simulated.
