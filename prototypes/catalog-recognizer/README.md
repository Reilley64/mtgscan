# Catalog recognizer prototype

**Throwaway Wayfinder prototype.** This prototype tests the scanner design recommended by issue #20 against the whole Scryfall paper catalog. A fast image match proposes candidates, and the printed collector line picks the exact printing. It uses only Apple system frameworks: Vision feature prints, Vision text recognition, Core Image, and Accelerate. It has no model file, no commercial SDK, and no network call at recognition time.

The same Swift files are meant to move into the phone app later. For the first physical test, the scanner-accuracy service on the tester's Mac runs them through a small helper process, so the phone app does not change.

## Pipeline

1. Rectify. The helper loads the photo with its EXIF orientation and warps the refined card outline to a 1191 x 1664 upright card. If the outline's top and bottom edges are longer than its sides, it moves each corner one place first.
2. Embed. It makes a 488 x 680 copy, the size of a Scryfall `normal` image, and its 180-degree turn. `VNGenerateImageFeaturePrintRequest` revision 2 with `scaleFill` gives a 768-value vector for each. Vectors are scaled to unit length.
3. Search. A brute-force dot product with `vDSP_mmul` compares both vectors with every catalog printing. If one orientation's best similarity is more than 0.03 above the other's, that orientation wins. Otherwise the collector line is read in both orientations and the clearer reading wins.
4. Shortlist. The top 50 printings, plus every printing that shares an illustration with any of the top 10.
5. Read. `VNRecognizeTextRequest` in accurate mode reads the bottom 16% of the upright card, enlarged to at least 300 pixels high, with every catalog set code as a custom word. The parser takes the set code from text such as `ELD • EN` and the number from `008/269`, `R 0173`, or the `146/165` at the end of an older copyright line. A star in place of the dot is reported as a premium mark.
6. Decide. In order:
   - A best similarity below 0.5 means not a card.
   - A set code and number that name a catalog printing are accepted if that printing's card is among the top 10 shortlist names. If not, the scan abstains with that printing first.
   - A set code alone is accepted if it leaves exactly one printing of the top card in the shortlist.
   - Without a usable reading, the top printing is accepted only if no other printing shares its art and the best printing with different art is at least 0.03 behind.
   - Everything else abstains and lists the top five printings.

The response has the same `candidates` and `decision` shape as the rectified recognizer, plus `reading`, `rotation`, `topSimilarity`, and `stageMs`, so the native preview app needs no change. A reason that starts with `not a card` lets the app learn a background, as before.

## Build and prepare

```bash
./scripts/build.sh                    # builds .build/mtg-catalog-recognizer
./scripts/test.sh                     # parser, catalog key, and quad fixture
node scripts/prepare-catalog.mjs      # catalog.json, images, and gallery under .data/
```

`prepare-catalog.mjs` reads Scryfall `default_cards` bulk data, or `SCRYFALL_BULK_FILE` if set. It keeps paper printings that are not digital and whose layout is not a token, art series, emblem, double-faced token, front card, vanguard, plane, or scheme. It downloads each front-face `normal` image with 8 requests at a time, then runs `mtg-catalog-recognizer index` to write `gallery.f16` and `gallery.json`. `CATALOG_DATA_DIR` moves the data directory.

`mtg-catalog-recognizer serve <catalog-dir>` reads one JSON request per line, either `{"requestId", "photoPath", "quad", "cropOutputPath"}` with the quad as four `[x, y]` points normalized to the displayed photo, or `{"requestId", "cropPath"}` for an already straightened card. It prints `{"ready": n}` once and then one response per line.

The scanner-accuracy service uses the helper when it starts with `RECOGNIZER=catalog`. It sends each uploaded photo to the helper, keeps only the 488 x 680 crop under `.prototype-data/catalog/crops/`, deletes the source photo, and logs each result in `.prototype-data/catalog/recognitions.ndjson`. `CATALOG_RECOGNIZER_BIN` and `CATALOG_DIR` override the default paths. In the native preview prototype, `npm run physical-run:catalog-bin` runs the bin wizard with this recognizer.

## Offline evidence

`node scripts/evaluate-crops.mjs <labels.json> [catalog-dir]` runs the helper on straightened crops and prints the totals. The labels file lists `{crop, scryfallId}` card entries and optional non-card crops. Relative paths in the labels file are read from the labels file's folder. `--scans` adds one row for each scan.

The committed evidence pack in `evidence/` holds the real crops, the simulation recipe, the bin-deck runs, and the expected results for each release gate. See `evidence/README.md`.

The issue #20 evaluation used 157 phone crops from the bin rounds, with every label checked against the printed collector line, and 11 crops of an empty bin floor or a finger. The crops are 488 x 680, so the collector line is read from an enlarged strip rather than the full photo. Results on the full 102,726-printing catalog of 6 October 2026 (Mac, Apple M3):

| Measure                               |      Result |
| ------------------------------------- | ----------: |
| Right card name first                 |  155 of 157 |
| Right exact printing first            |  143 of 157 |
| Correct accepts                       |  132 of 157 |
| False accepts                         |           0 |
| Non-card crops rejected as not a card |    11 of 11 |
| Helper time per crop, p50 / p95       | 71 / 116 ms |

On the same crops, the current rectified recognizer, which searches about 1,381 printings, made 91 correct accepts and 9 false accepts. Most abstentions in the new pipeline are printings that share their art with another printing when the enlarged strip gave no set code.

The 22 older iPhone photos with detected corners went through the full photo path: 19 had the right printing first, 11 were accepted, and none were accepted wrongly. Most of these photos are binder pockets, which are outside the approved scanning target.

The thresholds (0.5 not-a-card, 0.03 orientation, 0.03 art margin) were chosen on these same crops. They are not calibrated. Indexing the full catalog took 267 seconds on the Mac. The gallery is 158 MB at float16.

## Simulated and missing-printing evaluation

`uv run eval/simulate.py --bulk <default-cards.jsonl.gz> --images <cache> --output <dir>` renders Scryfall `large` images, a different file from the gallery's `normal` images, into synthetic phone photos. Each photo gets a random background and lighting, rotation and perspective, a 30% chance of being upside down, glare that is often over the collector line, sleeve haze, blur, motion blur, noise, JPEG compression, and a slightly wrong card outline. It writes `labels.json` with the photo file name, outline, true printing, and group. `--save-cards <file>` writes the chosen printings, and `--cards <file>` renders a saved list instead of choosing from `--bulk`. The default sample is 1,500 same-art reprints, 800 single-art printings, 400 Secret Lair and special frames, and 300 pre-2015 frames.

`node scripts/evaluate-crops.mjs <labels.json> --held-out` removes each true printing from the catalog for its own request. Every accept is then a false accept. This is what a printing missing from the gallery would cause. `--details` lists every false accept and accepted row.

## Smaller gallery

`uv run scripts/quantize-gallery.py <catalog-dir> <output-dir>` writes `gallery.i8`, one signed byte per value, and sets `"encoding": "int8"` in `gallery.json`. Each vector is scaled so its largest value is 127. The helper restores unit length when it loads the file, so search and decisions run unchanged on the float16 copy in memory. The file is 79 MB instead of 158 MB, and 58 MB after zlib.

`mtg-catalog-recognizer embed <labels.json> <vectors.f32>` writes both orientations' feature prints for every labelled input. `uv run eval/gallery-recall.py <labels.json> <vectors.f32> <catalog-dir>...` compares galleries by name and exact-printing recall at 1, 5, 20, and 50 from the image alone.

On 8 October 2026 the int8 gallery gave the same results as float16 on the 250 real crops: 247 right names first, 234 right printings first, 214 correct accepts, and no false accepts. Simulated results are in issue #16.

## Limits

- One tester, one phone, and one set of cards. The crops include repeats of the same 62 printings.
- The phone path, with the collector line read from the full-resolution photo, is not measured yet.
- Feature print revisions are tied to the operating system. The gallery was built on macOS 15.7. Moving the search onto the phone needs a check that iOS returns matching vectors, or a gallery built on the phone's revision.
- Android has no Vision framework. An Android build needs another embedding with a licence that allows product use.
