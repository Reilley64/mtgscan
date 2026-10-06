# Scanner accuracy prototype

**Rejected Wayfinder prototype.** This workspace tested whether a pure-Expo, three-still burst could produce useful physical-card recognition evidence before mtgscan adds native preview-frame processing. The iPhone 16e early kill rejected this dHash/OCR baseline. It is retained only as reproducible evidence, is not application architecture, and does not touch the collection.

## Current boundary

- `mobile/` is an Expo/React Native TypeScript harness. It uses only `expo-camera` for camera access. It keeps the scan batch in memory.
- `service/` is a local Node.js TypeScript HTTP service. It center-crops the card-shaped region aligned with the 72% mobile guide, computes a deterministic 64-bit difference hash, optionally reads the title strip with Tesseract, runs image-only, OCR-only, and hybrid rankings over the same three stills, and returns ranked Scryfall printings or abstentions for each strategy.
- `shared/` contains client-neutral Zod schemas and TypeScript contracts.
- `sample/kill-test-manifest.json` has 5 synthetic sample printings. `sample/benchmark-manifest.json` has 30. Neither contains collection data. Replace a copy with exact physical printings available to the tester when needed.
- `.prototype-data/` is ignored. It holds Scryfall metadata, full reference images, physical captures, derived hashes, outcomes, and reports.

This baseline is strictly still-only: Expo Camera does not expose arbitrary live preview frames through its documented interface, so it uses three calls to `takePictureAsync()`. It does not implement tracking, live quality gates, automatic preview detection, or a frame processor. The eventual flow is place card → detect centered and stable → automatically capture a still → recognize → ask for confirmation only when needed. Native-frame processing is the follow-up that must provide the required preview frames; it is not implemented here. **Finish prediction is explicitly unavailable**, so testers confirm finish manually. Embeddings, duplicate suppression, missed-change detection, and collection integration are also not implemented.

## Isolated ORB/RANSAC reranker experiment

`service/src/geometric-matcher.ts` remains a service-only, offline experiment. It uses Sharp-oriented 72% center crops and OpenCV ORB/BF-Hamming/RANSAC homography to rerank a pre-gated same-name set of printings. It is not wired into the HTTP endpoint or baseline strategies. It does not revive the rejected dHash/OCR baseline or establish general exact-print accuracy.

`service/src/isolated-geometric-runner.ts` adds a recyclable worker-process boundary for offline use:

```ts
const runner = createIsolatedGeometricRunner({
  maxReranksPerWorker: 5,
  timeoutMs: 10_000,
});
const result = await runner.rerank({
  stillPaths: [path1, path2, path3],
  candidates,
  referenceRoot,
});
await runner.close();
```

The parent sends exactly three file paths and candidate metadata over IPC. It never sends JPEG buffers. The child owns OpenCV and the reference cache. A worker clears that cache and exits after its configured rerank count. Timeouts and unexpected exits terminate the current worker and reject only the in-flight job; the next call starts another generation. `close()` is idempotent. Calls after close fail. The runner rejects concurrent reranks with `GEOMETRIC_RUNNER_BUSY` instead of queueing them. Results may include the worker PID, generation, completed and recycle counts, and RSS. They do not include capture data or paths.

Run the original direct evaluation or the isolated soak from this workspace:

```bash
npm run geometric:evaluate -w @scanner-accuracy/service
npm run geometric:soak -w @scanner-accuracy/service
# Optional controls
npm run geometric:soak -w @scanner-accuracy/service -- \
  --repetitions 20 --max-reranks-per-worker 5 --timeout-ms 10000
```

The soak defaults to 20 replays of the ignored five-scan physical evidence, for 100 reranks. It writes `isolated-soak-latest.json` under the ignored `.prototype-data/geometric/` directory. Its report contains no capture bytes or paths. The agreed gates are exact top-1 on every completed attempt with zero false accepts, end-to-end and matcher-warm p95 each at most 1,000 ms, and parent and worker RSS each below 450 MiB. The growth gates use a 16 MiB allowance. Every parent RSS sample must stay within that allowance above the first-window median. Every worker generation peak must stay within it above the median peak of the first five generations. The default run also requires all 80 expected warm samples.

The 100-rerank isolated run completed all attempts with 100/100 exact top-1, 100 correct accepts, and zero false accepts. End-to-end latency was 408 ms p50, 845 ms p95, and 1,201 ms max. Matcher warm latency, excluding each generation's first call, was 398 ms p50, 493 ms p95, and 586 ms max across 80 calls. The run used 20 generations and 20 clean recycles with zero timeouts, unexpected exits, or other job failures.

Parent RSS peaked at 112,640,000 bytes, about 107.4 MiB. Worker RSS peaked at 396,754,944 bytes, about 378.4 MiB. Both pass the separate-process 450 MiB gate. Combined peak RSS was 509,362,176 bytes, about 485.8 MiB. Combined RSS is a diagnostic, not an agreed acceptance gate; this run would fail a hypothetical combined 450 MiB cap. Across 101 parent samples, the first-window median was 112,525,312 bytes and the observed maximum was 112,640,000 bytes. The 114,688-byte maximum delta passes the 16 MiB allowance. Across 20 worker generations, the median of the first five generation peaks was 380,059,648 bytes and the maximum generation peak was 396,754,944 bytes. The 16,695,296-byte maximum delta narrowly passes the 16,777,216-byte allowance. As a trend diagnostic, the final five-generation median was 385,941,504 bytes, 5,881,856 bytes above the baseline. All agreed gates passed. This is still narrow repeated evidence over five recorded scans, not a representative accuracy or platform study. The earlier in-process 50-rerank run remains useful failure evidence: its RSS grew from 320 MiB to 451 MiB without a plateau.

## Rectified crop recognition experiment

This is a throwaway service path for the physical recognition experiment in issue #10. The phone finds the four outer corners of the card and sends one photo per card. The service straightens the card and picks the exact Scryfall printing from a fixed candidate set. It is separate from the rejected three-still baseline above.

### Request contract

`POST /rectified-recognitions`

- `Authorization: Bearer <PROTOTYPE_TOKEN>`
- `Content-Type: image/jpeg`
- `X-Scan-Id`: 1 to 80 characters from `[A-Za-z0-9_-]`
- `X-Card-Quad`: JSON `{"topLeft":{"x":n,"y":n},"topRight":{...},"bottomRight":{...},"bottomLeft":{...}}`. Coordinates are normalized from 0 to 1 with an upper-left origin. They use the displayed photo orientation, after the JPEG EXIF orientation is applied. Corners go clockwise. The app starts from the corner nearest the top-left of the photo, so the card can be sideways or upside down. The service handles both cases (see the pipeline).
- Body: the raw JPEG bytes.

The service rejects a body over 12 MB (`413`), a content type other than `image/jpeg` (`415`), and a body without a JPEG signature, an invalid scan ID, or an invalid quad (`400`). A quad is invalid if a value is not finite, if a point is more than 0.001 outside the photo, if the corners are not convex and clockwise, or if it covers less than 1% of the photo. The service runs one rectified recognition at a time and returns `429` while one is in progress.

A `200` response has this shape:

```json
{
  "scanId": "string",
  "serviceLatencyMs": 0,
  "stageMs": { "decode": 0, "rectify": 0, "rank": 0, "rerank": 0 },
  "rotation": 0,
  "candidates": [
    {
      "scryfallId": "",
      "oracleId": "",
      "name": "",
      "set": "",
      "collectorNumber": "",
      "score": 0
    }
  ],
  "decision": { "accepted": false, "scryfallId": null, "reasons": [] },
  "printingCheck": null
}
```

`rotation` is 0, 90, 180, or 270. It is how many degrees clockwise the service turned the sent corner order to make the card upright. `candidates` holds the top 5, best first. `score` is the number of RANSAC inliers for that printing. It is 0 when the homography is not plausible. When the printing check picks a printing, that printing is moved to the first place.

`printingCheck` is `null` unless the top printing shares its Scryfall illustration with other printings (see the printing check below). Otherwise it holds `illustrationId`, `chosen` (a Scryfall ID or `null`), `reason` (why it abstained, or `null`), `ms`, `alignment` (`controls`, `usable`, `noise`), and one entry per printing with that art: `scryfallId`, `set`, `collectorNumber`, `cluster`, `coarse`, `fine`, `markError`, and `unexplained`.

The service keeps only the straightened, upright card crop at `.prototype-data/rectified/crops/<scanId>.jpg` and one line per request in `.prototype-data/rectified/recognitions.ndjson`. The line holds the scan ID, timestamp, candidates, decision, rotation, stage timings, and `printingCheck`. When the printing check runs, the service also keeps the high-resolution card it compared, 745 x 1040 pixels, at `.prototype-data/rectified/printing-crops/<scanId>/card.jpg`. The service does not store the source photo.

### Pipeline

1. Decode and rectify. Sharp applies the EXIF orientation and scales the photo so the card is about 850 pixels tall. If the top and bottom edges of the quad are longer than its sides, the card is sideways, so the service moves each corner one place along the clockwise order. A short edge is then on top. A perspective warp maps the quad to a 488 x 680 raster, the size of a Scryfall `normal` image. The warp also keeps a 10% margin around the card for the later stages.
2. Rank. The service compares the crop with every reference using two descriptors:
   - Color: a 16 x 22 grid of mean lightness and two color-opponent channels. Each channel has its mean removed and is scaled to unit length.
   - Edge: the gradient strength of a 64 x 88 grayscale copy of the card, blurred and sampled on a 32 x 44 grid. The outer ring of cells is dropped, because the card outline in a photo has no match in a reference image. Values are log-scaled, centered, and scaled to unit length. Foil sheen and sleeve glare change tones a lot, but they keep most edges in place, so this descriptor still finds those cards.

   Both descriptors search windows of different scale and offset inside the margin. This handles a quad that follows the inner frame or a binder pocket instead of the card edge.

3. Orientation. The service ranks the crop and the crop turned 180 degrees. The strength of a view is its best color score plus its best edge score. The stronger view goes to the reranker. If the two strengths are less than 0.03 apart, both views go to the reranker, and the view whose top printing has more inliers wins.
4. Rerank. The shortlist is the top 8 printings by color, the top 8 by edge, and other printings of the top 3 identities by fused score, up to 24 in total. The fused score is the sum of the two scores after each is standardized across the corpus. Three worker processes match ORB features of the full card against stored reference features. They use a ratio test and a RANSAC homography. A homography is plausible only if the projected reference is convex, upright, near the crop, and has a sensible area. Each worker is replaced after 50 jobs. The replacement starts at once.
5. Decide. The service accepts the top printing only if all of these are true:
   - it has at least 25 inliers;
   - at least 15 inlier grid cells support only that printing, and each rival has no more than half that number of cells that support only the rival;
   - its fused appearance score is at least 1.0 higher than every other reranked printing;
   - every other printing in the catalog with the same Scryfall illustration was reranked too, or the printing check below covers it.

   If any check fails, the service abstains and lists the reasons. ORB inliers fall mostly on the frame and text, which many printings share. The appearance check covers the art. The illustration check covers reprints that share the art and differ only in small frame details.

6. Printing check. This step runs only when the top printing shares its Scryfall illustration with other printings in the corpus (a same-art group). The rival checks in step 5 then skip printings with the same art, and this step picks between them instead. See the next section.

### High-resolution printing check

Half of the 30-card test deck has reprints with the same art. At 488 x 680 the set symbol is about 12 pixels wide, so the crop cannot tell these printings apart. The List and promo printings also keep the original set symbol and differ only by a small stamp. The printing check compares the card at the resolution of the Scryfall `png` scans, 745 x 1040, and only where printings with the same art differ.

Preparation (`rectified:prepare`) does this for each group of 2 or more printings that share an illustration:

1. Download the Scryfall `png` image of each printing (745 x 1040, lossless; `large` is a 672 x 936 JPEG). The images are cached under `.prototype-data/scryfall/png/`.
2. Split the group into layout clusters. Each printing is aligned to the first printing of a cluster: a whole-card shift at 1/8 scale, then an affine fit to tile shifts at half scale, then a smooth correction field (32-pixel grid) from tile shifts at full scale. A printing joins the cluster only if the fit is near identity and at most 12% of its 16 x 16 tiles still differ. Otherwise it starts or joins another cluster. Different frames end up in different clusters.
3. Compare each aligned printing with the cluster anchor tile by tile, after local contrast normalization. Comparisons allow a 2-pixel shift, so small print registration offsets do not count. A tile is a mark tile if it differs by more than 0.08 and by more than 6 times the median tile difference of that printing. For each pair of printings, store which mark tiles separate them.
4. Store the mark tiles of every printing (8-bit), 120 control tiles of the anchor (textured tiles that no printing changes, spread over 8 bands of the card), and a 1/8-scale copy of every printing for the frame comparison.

The data goes to `.prototype-data/rectified/printing/`. The current corpus has 72 groups, 314 printings, and 138 clusters.

At request time:

1. After ranking, if a leading candidate is in a same-art group, the service starts to decode the full photo again, at about 1.3 times the reference height. This runs while the reranker works.
2. The ORB homography of the top printing, the quad transform, and the cluster alignment map the cluster anchor to the photo. The service samples a 745 x 1040 card from the full photo.
3. If the group has more than one cluster, it compares the card at 1/8 scale with every printing. The best printing must be ahead of every printing in another cluster by at least 0.03, or the service abstains. If the best cluster has only one printing, no mark tiles can confirm it. Then the error of the best printing in another cluster must also be at least 1.8 times its own error, and the printing must also be the ORB top printing.
4. Each control tile searches a shift of up to 5 pixels. A perspective fit to the good control shifts, plus a local correction from the 4 nearest controls, predicts the shift of each mark tile. If fewer than 12 controls fit, the service abstains.
5. Each printing in the cluster is scored on the mark tiles with a 1-pixel search. A first pass at the predicted shift drops printings that are clearly worse, so most requests score only a few printings with the search.
6. The best printing is accepted only if, for every other printing, on the tiles that separate the two, its mean error is at least 0.03 lower and at most half the rival's error. Its mean error on those tiles must be at most 0.08, or 3 times the median control error if that is higher. At most 1 mark tile may exceed that limit. Otherwise the service abstains with a reason such as "same-art printings too close".

The check never accepts on a tie. When it picks a printing, step 5 still applies to the other identities.

### Printing check results

These results are synthetic. The photos are rendered from Scryfall scans, so they are easier than real cards: the art, ink, and paper of the photo come from the same scan family as the reference. They show that the mechanics work. They do not replace a physical round.

The evaluation covers the 14 same-art groups that hold a test-deck printing: 100 printings, 3 quads each. Seed 4 ran on the final code and was not used to tune anything:

| Same-art group                       | Deck printing    | Printings | Runs | Correct | Abstained | Wrong | Correct without check |
| ------------------------------------ | ---------------- | --------: | ---: | ------: | --------: | ----: | --------------------: |
| Beanstalk Giant // Fertile Footsteps | ELD 295          |         2 |    6 |       6 |         0 |     0 |                     0 |
| Gravedigger                          | TMP 137          |        21 |   63 |      59 |         4 |     0 |                     1 |
| Command Tower                        | CMM 420          |        27 |   81 |      63 |        18 |     0 |                     0 |
| Angelic Gift                         | AFC 64           |         7 |   21 |      21 |         0 |     0 |                     0 |
| Admiral's Order                      | RIX 31           |         3 |    9 |       9 |         0 |     0 |                     0 |
| Bake into a Pie                      | ELD 76           |         4 |   12 |      11 |         1 |     0 |                     0 |
| Blood Artist                         | EMA 81           |         6 |   18 |      18 |         0 |     0 |                     0 |
| Azor's Gateway // Sanctum of the Sun | RIX 176          |         3 |    9 |       9 |         0 |     0 |                     0 |
| Black Cat                            | M15 86           |         5 |   15 |      15 |         0 |     0 |                     0 |
| Ajani Steadfast                      | CMM 813          |         2 |    6 |       6 |         0 |     0 |                     0 |
| Athreos, God of Passage              | JOU 146          |         2 |    6 |       6 |         0 |     0 |                     0 |
| Charming Prince                      | FDN 568          |         6 |   18 |      18 |         0 |     0 |                     3 |
| Colossal Dreadmaw                    | M21 176, RIX 125 |        10 |   30 |      27 |         3 |     0 |                     3 |
| Font of Fertility                    | JOU 123          |         2 |    6 |       6 |         0 |     0 |                     6 |
| All                                  |                  |       100 |  300 |     274 |        26 |     0 |                    13 |

By quad, with the check: true quad 93 correct and 7 abstained, corners moved by up to 5 pixels 91 and 9, inner-frame quad 90 and 10. Every one of the 15 deck printings was correct with all 3 quads (45 of 45). Without the check, 3 of 45 were correct and the rest abstained. Earlier seeds on earlier code gave 290, 271, and 271 correct of 300, all with no wrong accepts.

Of the 26 abstentions, 18 had more than 1 mark tile that did not match the best printing (16 of them in Command Tower, where glare or blur fell on the collector line or set symbol), 6 had two frame clusters too close at 1/8 scale (Colossal Dreadmaw J25 646, Gravedigger, Bake into a Pie FDN 169), and 2 had two Command Tower printings too close on their mark tiles.

Held-out runs, check on:

- True printing removed from the corpus and the printing data, but kept in the catalog (the same meaning as `rectified:evaluate --hold-out-expected`), seed 2: 300 of 300 abstained.
- True printing also removed from the catalog (`--drop-from-catalog`), seed 4: 27 false accepts of 300 with the check and 18 without. 17 of the 27 come from groups that drop to one printing, so the check does not run and the result is the same as without it (The List and original pairs of Beanstalk Giant and Athreos, Ajani Steadfast, Font of Fertility). The check itself picked a wrong printing 10 times: 8ED 138 and 8ED 138★ for each other, Blood Artist JMP 206 and VOC 119 for each other, PLST CMR-350 as CMR 350, and Charming Prince FDN 568 as ELD 8. In those cases the missing printing differs only where the remaining printings agree, or in a frame that no remaining printing has. The masks were still built with the missing printing present. A printing that preparation never saw (for example a new set or a non-English card) has the same risk, and the catalog check cannot catch it.

Latency, on this Mac, service time only:

| Run                                    | p50 without check | p50 with check | p95 without check | p95 with check | Printing step p50 / p95 |
| -------------------------------------- | ----------------: | -------------: | ----------------: | -------------: | ----------------------: |
| Seed 1, quiet machine, earlier code    |               396 |            492 |               434 |            586 |                 - / 138 |
| Seed 4, final code, other jobs running |               433 |            563 |               564 |            810 |               127 / 172 |

The added time in seed 4 is 130 ms at p50 and 246 ms at p95. The printing step itself (load the group, wait for the second decode, sample, align, score) took at most 227 ms. It runs only when the top printing has same-art printings. The second decode overlaps the reranker.

Low-resolution regression, final code: the phone-crop set gave 21 of 21 identities, 19 printings first, 13 correct accepts, 0 false accepts, and 8 abstentions, the same as before. The offline set gave 22 of 22 printings first, 18 correct accepts, 0 false accepts, and 4 abstentions, also the same. These crops are only 488 x 680, so the check often abstains on them ("regions ... do not match"), which is the safe outcome.

What was tuned, and on which data:

- The mark threshold (0.08 and 6 times the median), the pair rule (0.03 lower and at most half), the mark error limit (0.08 or 3 times the control error), and the 0.03 frame margin were set in a Python prototype on one synthetic render per printing, before these runs. They did not change after that.
- The 12% cluster limit came from tile differences between the reference scans only.
- The 2-pixel shift in preparation and the 5-pixel control search were changed after seed 1, where the Command Tower group had one false accept and many alignment failures.
- The limit of 1 unexplained mark tile was set on seed 1 and its held-out run.
- The 1.8 error ratio for single-printing clusters was set on seeds 1 to 3 and the seed 2 held-out run.
- Seed 4 was run once on the final code.

Each request with the check writes `printing-crops/<scanId>/card.jpg` and the per-printing scores, so the next physical round gives real data to check these numbers.

### Candidate corpus

The corpus is the union of every Scryfall ID in `../../current_collection.csv` and every English paper printing of each card name in `.prototype-data/personal-kill-test-manifest.json`. The name list uses the Scryfall search `!"<name>" unique:prints lang:en game:paper`. The current corpus has 1,339 printings and 968 oracle identities: 986 printings from the collection and 353 more from the 31 name searches. Arcane Signet alone has 91 printings, and Command Tower has 114.

Preparation uses only the `Scryfall ID` column of the CSV and the `name` field of the manifest. It copies no other collection fields. It caches metadata, search pages, and reference images under `.prototype-data/scryfall/`. It writes `corpus.json`, `appearance.bin`, `edge.bin`, `orb-points.bin`, and `orb-descriptors.bin` under `.prototype-data/rectified/`. Server startup loads these files and does not compute features. Run `rectified:prepare` again after this change, because older corpora have no `edge.bin`.

### Prepare, evaluate, and start

```bash
npm run rectified:prepare -w @scanner-accuracy/service
npm run rectified:evaluate -w @scanner-accuracy/service
npm run rectified:evaluate -w @scanner-accuracy/service -- --set phone
npm run rectified:evaluate -w @scanner-accuracy/service -- --rotate 180
npm run rectified:evaluate -w @scanner-accuracy/service -- --hold-out-expected
npm run rectified:evaluate -w @scanner-accuracy/service -- --repeat 3
npm run rectified:printing-evaluate -w @scanner-accuracy/service -- --deck <test-deck.tsv>
npm run rectified:printing-evaluate -w @scanner-accuracy/service -- --deck <test-deck.tsv> --hold-out-expected --drop-from-catalog --check-only
npm run start -w @scanner-accuracy/service
```

A cold preparation took about 15 minutes, mostly for the paced image downloads. The printing check adds 314 `png` downloads (399 MB, about 2.5 seconds each with the 500 ms pacing, so about 13 minutes cold) and about 3 minutes to build the groups. With a warm cache the whole preparation takes about 4 minutes. The printing data uses 127 MB. The evaluation sends each photo and its quad through the same code as the endpoint. It writes the crops to `/tmp/np/rectified-eval*/` and a report to `.prototype-data/rectified/evaluation-<set>[-<rotation>][-held-out]-latest.json`. It does not write to the endpoint log.

- `--set offline` (the default) reads `/tmp/np/eval/quads.json` (`--quads` changes this): stored iPhone photos with corners from the native detector.
- `--set phone` reads `/tmp/np/phone-crops/truth.json` (`--truth` changes this): straightened card crops from the physical phone run, each with its true printing. The quad is the crop edge.
- `--rotate 90|180|270` turns each photo clockwise and moves the quad with it. The corners start from the one nearest the top-left of the turned photo, as the app sends them.
- `--hold-out-expected` removes the true printing from the searchable corpus, so every accept is a false accept. The printing stays in the catalog, so the illustration check still knows it exists.

`rectified:printing-evaluate` builds synthetic phone photos for the printing check. It takes every same-art group that holds a test-deck printing (`--deck` is a TSV with the Scryfall ID in the first column, such as `.physical-runs/test-deck.tsv` of the native preview prototype; without it, groups that hold a name from `extra-names.txt`). For each printing in those groups it renders one photo from the Scryfall `large` JPEG, a different file from the `png` reference: a 2376 x 4224 portrait frame stored as 4224 x 2376 with EXIF orientation 6, a card 1,500 to 2,300 pixels tall with rounded corners, up to 8 degrees of rotation and some perspective, a noisy background, blur, a lighting gradient, a color cast, a glare spot, sensor noise, and JPEG quality 80 to 92. Each photo goes through the full endpoint path three times: with the true quad, with each corner moved by up to 5 pixels, and with a quad on the inner frame. Each run is repeated without the printing check unless `--check-only` is set. `--seed` changes the photos. `--hold-out-expected` removes the true printing from the corpus and from the printing data, and `--drop-from-catalog` also removes it from the catalog. The report goes to `.prototype-data/rectified/printing-evaluation-seed<n>[-held-out][-from-catalog].json`.

### Offline and phone-crop results

Two sets were used. The offline set is 22 stored iPhone photos (1450 x 1080) with detected corners: 6 of the DSC Arcane Signet on a wood table, and 16 of the Secret Lair foil Arcane Signet in a binder, where most quads follow the pocket. The phone set is 21 card crops from the first physical phone run: 19 printings, including foil Secret Lair cards with heavy sheen, sleeve glare, and several printings that share a name and art (Colossal Dreadmaw, Command Tower, Arcane Signet).

Each row is one pass. Three passes with three workers gave the same answers in every pass. Latency is the service time over the three passes, on an Apple silicon Mac.

| Set                   | Crops | True printing reranked | Identity top-1 | Printing top-1 | Correct accepts | False accepts | Abstentions | p50 ms | p95 ms |
| --------------------- | ----: | ---------------------: | -------------: | -------------: | --------------: | ------------: | ----------: | -----: | -----: |
| Offline, wood (DSC)   |     6 |                      6 |              6 |              6 |               6 |             0 |           0 |    333 |    405 |
| Offline, binder (SLD) |    16 |                     16 |             16 |             16 |              12 |             0 |           4 |    346 |    363 |
| Phone crops           |    21 |                     21 |             21 |             19 |              13 |             0 |           8 |    292 |    344 |
| Offline, held out     |    22 |                      - |             18 |              0 |               0 |             0 |          22 |    350 |    554 |
| Phone crops, held out |    21 |                      - |              7 |              0 |               0 |             0 |          21 |    306 |    468 |

Turned inputs:

| Set                              | Crops | Identity top-1 | Printing top-1 | Correct accepts | False accepts | p95 ms |
| -------------------------------- | ----: | -------------: | -------------: | --------------: | ------------: | -----: |
| Offline, turned 90               |    22 |             22 |             22 |              18 |             0 |    380 |
| Offline, turned 180              |    22 |             22 |             22 |              19 |             0 |    367 |
| Offline, turned 270              |    22 |             22 |             22 |              18 |             0 |    372 |
| Phone crops, turned 90           |    21 |             20 |             17 |              13 |             0 |    338 |
| Phone crops, turned 180          |    21 |             21 |             18 |              13 |             0 |    348 |
| Phone crops, turned 270          |    21 |             21 |             18 |              13 |             0 |    357 |
| Offline, turned 180, held out    |    22 |             21 |              0 |               0 |             0 |    603 |
| Phone crops, turned 90, held out |    21 |              7 |              0 |               0 |             0 |    642 |

Every turned input came back with the right rotation. With the true printing present, the right view was always stronger, by at least 0.05. With the true printing held out, some views were close, so both went to the reranker. That doubles the rerank time, so held-out runs have the slowest requests (maximum 865 ms).

With the previous code (same corpus and crops), the phone set had 18 of 21 true printings reranked, 16 right printings first, 7 correct accepts, no false accepts, and a 163 ms p50. The color descriptor ranked the foil Secret Lair Arcane Signet and Command Tower about 1,230th of 1,339 printings and the foil Abrade 237th, so the reranker never saw them. With both descriptors, every true printing reached the reranker in both sets.

A typical request spends 2 to 25 ms decoding, 10 ms rectifying, 140 ms ranking both views, and 180 to 240 ms reranking.

Phone-crop abstentions:

- Foil Secret Lair Arcane Signet and Command Tower: the right printing is first, with only 12 and 20 inliers.
- DSC Arcane Signet, M21 Colossal Dreadmaw, CMM Command Tower, TMP Gravedigger, and RIX Admiral's Order: another printing of the same card is too close on inlier cells. M21 Colossal Dreadmaw and RIX Admiral's Order also rank second, behind a printing with the same art. For CMM Command Tower and TMP Gravedigger, 3 and 8 printings with the same art were also not reranked.
- RIX Colossal Dreadmaw: the right printing is first with 139 inliers, but its appearance lead is only 0.40.

What was tuned, and on which data:

- The 0.03 orientation margin, the shortlist sizes, and the 1.0 fused appearance margin were all chosen on these two sets. In the held-out runs, the closest false candidate had a fused lead of 0.48, so 1.0 leaves some room. These numbers do not establish a false-accept rate.
- An inlier-ratio threshold was tried to stop a Font of Fertility reprint (CMM) from being accepted when the JOU printing was held out. It also rejected many correct binder photos, so it was dropped. The illustration check rejects that case instead. It relies on the catalog listing every printing, even ones that have no reference features.
- The old 0.05 color-only appearance check was dropped. Sleeve glare lowers the color score of the right printing, and that check caused most of the phone-crop abstentions.

The corpus builder also reads an optional, ignored `.prototype-data/rectified/extra-names.txt` with one card name per line, and adds every English paper printing of those names. The native preview prototype fills it with the names in its fixed 30-card test deck, so each deck card competes with its same-name printings. With those 27 names the corpus has 1,381 printings.

## Catalog recognizer

Starting the service with `RECOGNIZER=catalog` replaces the rectified recognizer on `POST /rectified-recognitions` with the full-catalog helper in `../catalog-recognizer`. The request and response contract stay the same. The response adds `reading`, `topSimilarity`, and `stageMs` from the helper. The service writes each photo to `.prototype-data/catalog/incoming/` only while the helper runs, keeps the 488 x 680 crop under `.prototype-data/catalog/crops/`, and logs results in `.prototype-data/catalog/recognitions.ndjson`. See `../catalog-recognizer/README.md`.

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
