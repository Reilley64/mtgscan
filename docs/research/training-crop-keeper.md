# A training crop keeper that follows the scan batch

Date: 2026-10-19

Research notes for the architecture review of 19 October 2026. Candidate 7 (candidate 6 in the explorer notes).

Sources: the code at `HEAD` (`36c0138`), commit `abcceba` (#399), spec #389, tickets #390 to #397, ADR 0011, `GLOSSARY.md`, `CODING_STANDARDS.md`, and `README.md`. All app paths are under `apps/mobile/`.

## Where training crop files live today

The phone handles one training crop file in four places:

1. **Caches.** The recognizer writes `Caches/training-crops/<UUID>.jpg` for every card recognition, accepted or not (`modules/card-recognizer/ios/Recognizer/CardRecognizer.swift:112`, `TrainingCrop.swift:9-15`, `CardRecognizerModule.swift:126-128`).
2. **Documents, per scan.** When a scan enters the scan batch, the app moves the file to `training-crops/<user ID>/<copy ID>.jpg` (`src/scan/training-crops.ts:25-35`). The scan keeps the absolute file URI in `trainingCrop.uri` (`src/scan/scan-batch.ts:11-20`, `34`).
3. **The scan batch file.** `scan-batch-<user ID>.json` saves each scan, URI included, after every change once the batch is restored (`src/scan/scan-batch-state.tsx:342-346`, `src/scan/scan-batch-file.ts:31-33`).
4. **The upload queue file.** `training-crop-queue-<user ID>.json` holds each waiting crop with its URI (`src/scan/training-crops.ts:14-20`, `80-90`).

### Every path that creates, keeps, drops, queues, or uploads a crop file

| # | Path | What happens to the file | Code |
| --- | --- | --- | --- |
| 1 | Card recognition | Native code writes the crop to Caches | `CardRecognizer.swift:112` |
| 2 | Recognition ends, scan enters the batch | Move to Documents under the copy ID | `scan-batch-state.tsx:142-170`, `353-360`; `training-crops.ts:25-35` |
| 3 | Recognition ends with a basic land, no candidates, or no user or gallery version | Drop the Caches file | `scan-batch-state.tsx:168` |
| 4 | Move fails | Drop the Caches file | `training-crops.ts:32-34`, `scan-batch-state.tsx:155-168` |
| 5 | Recognition ends after Remove all scans or an account change | Keep runs first, then the reducer marks the crop stray and an effect drops it | `scan-batch-state.tsx:113`, `183`, `229-231`, `291-296` |
| 6 | Remove scan | A wrapper around `dispatch` drops the crop, then dispatches | `scan-batch-state.tsx:366-374` |
| 7 | Remove all scans | Drop every crop in the batch, then reset | `scan-batch-state.tsx:376-379` |
| 8 | **+1** | The new scan gets no crop | `scan-batch.ts:127-131` |
| 9 | Name search on a scan that was not recognized | The new scan gets no crop (path 3 already dropped it) | `scan-batch-state.tsx:194-205` |
| 10 | Scan batch commit works, uploads known off | Drop the crops of the committed scans | `scan-batch-state.tsx:315-316` |
| 11 | Scan batch commit works, uploads on or not yet known | Queue the crops, with a new crop ID and an upload time | `scan-batch-state.tsx:317-318`; `training-crops.ts:80-90` |
| 12 | Pending commit found on restore | Same as 10 or 11, for the restored scans | `scan-batch-state.tsx:328-335` |
| 13 | Upload works or is refused (400) | Drop the file, remove the queue entry | `training-crops.ts:113-125` |
| 14 | Upload fails another way | Stop, keep the rest of the queue | `training-crops.ts:117-118` |
| 15 | Upload training crops switch turned off | Drop every waiting crop | `training-crop-uploads-setting.tsx:64-66`; `training-crops.ts:92-97` |

### Every scan batch edit

Reducer actions: `recognized`, `choose`, `setFinish`, `setCondition`, `setLanguage`, `addCopy`, `remove`, `commitStarted`, `committed` (`scan-batch.ts:42-60`). Provider actions on top: `accountChanged`, `restored`, `recognitionStarted`, `recognitionEnded`, `commitFailed`, `commitSucceeded`, `removedAll`, `strayTrainingCropsDropped` (`scan-batch-state.tsx:71-86`). Of these, five change which scans hold a crop: `recognitionEnded` (adds), `remove`, `removedAll`, `commitSucceeded` (take out), and `restored` (brings back from disk). `choose`, the three setters, and `addCopy` keep the crop where it is.

## 1. Is the friction real and as large as the review says?

Partly. The spread is real. The review's picture of where it hurts is not.

### What the review gets right

- Each line reference in the explorer notes matches the code (`mobile.md`, candidate 6). `keptTrainingCrop` is at `142-170`, the remove wrapper at `366-374`, Remove all scans at `376-379`, the stray crops at `68`, `86`, `113`, `230-231`, `291-296`, the commit at `298-302` and `315-319`, **+1** at `scan-batch.ts:130`, and the switch at `training-crop-uploads-setting.tsx:64-66`.
- The reducer is pure, so the file work sits in a wrapper, a callback, an effect, and the commit. Each new edit that takes a scan out of the batch must remember to drop its crop. Nothing checks it.
- The keep decision runs before the reducer decides whether the recognition makes a scan. The stray crop state (one state field, two actions, one effect) exists only to undo a move that was made too early (`scan-batch-state.tsx:113`, `291-296`).
- Commit `abcceba` changed `scan-batch-state.tsx`, `scan-batch.ts`, `scan-batch-file.ts`, `training-crops.ts`, `training-crop-uploads-setting.tsx`, and `fake-file-system.ts` together (`git show --stat abcceba`).

### What the review gets wrong

- **"+168 lines in #399".** It is 140 added and 28 removed (`git show --numstat abcceba`). Part of it is the evidence record fields (`recognizedPrintingId`, gallery version, recognizer version) and the switch ref, not file cleanup.
- **"Six edit paths in the scan batch provider".** Five are in the provider (paths 2, 5, 6, 7, 10 and 11). **+1** is in the pure reducer, and the switch is in another provider. The upload loop (path 13) also drops files.
- **The "before" diagram marks remove, Remove all scans, stray crops, commit, and the switch as leaks.** None of them leaks in the normal flow. Tests cover each: `test/training-crops.test.tsx:698` (Remove scan), `719` (Remove all scans), `733` (after Remove all scans), `749` (after a sign out), `398` (switch off), `429` (commit with uploads off).
- **"Fewer leftover-file tests".** The tests would stay. #392 asks for tests on remove and Remove all scans, and `CODING_STANDARDS.md` (Tests) says every acceptance criterion has a test that checks external behavior. A keeper changes the implementation, not what the tests check.

### What the review missed

The real gaps are at restart and across files, not in the edit paths. These are reasoned from the code. None was reproduced on a device.

**A. A waiting crop whose file is gone can stall the upload queue.** Nothing checks that the file exists before upload (`training-crops.ts:101-106`, `116-118`). The app sends the file as a `FormData` part with a `uri`. In React Native 0.85.3 (the app's version, `package.json`), a body part that cannot be read logs `Error processing request body` and returns without telling JavaScript (`RCTNetworking.mm:342-348` at tag `v0.85.3`, https://github.com/facebook/react-native/blob/v0.85.3/packages/react-native/Libraries/Network/RCTNetworking.mm). A missing file fails to read (`RCTFileRequestHandler.mm:66-68`). The app passes no `timeout` to `functions.invoke` (`training-crops.ts:106`), and `invoke` only uses one when it is given (https://github.com/supabase/supabase-js/blob/master/packages/core/functions-js/src/FunctionsClient.ts, lines 266-295). So the upload promise likely never settles. It holds the queue lock (`training-crops.ts:67-73`) for the rest of the session. Then:
- later commits never write their crops to the queue, and a kill loses them, because the scans already left the batch;
- turning the switch off never drops the waiting crops, because `setUploadsOn` awaits the same lock (`training-crop-uploads-setting.tsx:64-66`);
- the same entry stalls the queue again at every start.

Even if the request did fail with a network error instead, the entry would count as `failed` and block every crop behind it on every start (`training-crops.ts:117-118`). The fake Supabase client never reads the image (`test/fake-supabase.ts:1291-1318`), so no test can see this.

**B. Ways a queue entry can point to a missing file.**
- *Remove scan during a commit.* The batch review sheet hides Remove all scans and scan details while the commit runs (`src/app/scan-batch/index.tsx:69`, `82-86`). The Scan screen does not. During a pull-to-add commit, the latest-scan chip still opens scan details (`src/scan/scan-camera.tsx:19-21`, `src/components/organisms/latest-scan-controls.tsx:20`), and its Remove scan drops the crop at once (`scan-batch-state.tsx:368-370`). The commit then works with the scans it captured, and `queueTrainingCrops` queues that crop (`scan-batch-state.tsx:305`, `314-318`; `training-crops.ts:82` checks only the crop fields). The removed scan is also saved as a copy, which is a separate bug.
- *Absolute URIs across app updates.* Both files save `file://…/Documents/…` URIs (`training-crops.ts:31`, `85`). On iOS the app's data container path is widely reported to change on an app update (https://stackoverflow.com/questions/5607655). I could not confirm this in current Apple docs in this session. If it holds, every scan in the batch and every waiting crop points to a missing file after an update. A crop waits 1 to 7 days, so an update during the wait is likely in a beta. The path is already fully known from the user ID and the copy ID (`training-crops.ts:27-30`), so the URI does not need to be saved.
- *Kill windows.* Remove scan deletes the file before the batch file is written (`scan-batch-state.tsx:369-371`, write at `342-346`). A kill in between restores a scan whose crop is gone. After a commit, the batch write (effect) and the queue write (async, `training-crops.ts:89`) race. A kill after the queue write and before the batch write restores a pending commit, which commits again (the server keeps each copy ID once) and queues the same crops a second time with new crop IDs. The first upload deletes the file, and the second entry then points to nothing. These windows are milliseconds.

**C. Crop files that nothing will ever drop.**
- A scan batch file in an unknown format version, or one that fails to parse, reads as empty (`scan-batch-file.ts:12-17`, `versioned-user-file.ts:12-16`, `README.md:139`). The empty batch is then written over it (`scan-batch-state.tsx:342-346`). Scans without a `printing` are filtered out the same way (`scan-batch-file.ts:26`). The crops of those scans stay in Documents for good.
- The upload queue does the same: a bad or unknown queue file reads as `[]` (`training-crops.ts:56-61`), and the next write replaces it. Its files stay.
- A kill after a commit's batch write but before its queue write leaves the committed crops in no list.
- A crop written to Caches whose recognition never reaches JavaScript (a kill, or a throw in `CardRecognizerModule.swift:93`) stays in `Caches/training-crops`. iOS may purge Caches, so this matters less.

Nothing lists `training-crops/<user ID>/` and compares it with the batch and the queue. The fake file system has no directory listing (`test/fake-file-system.ts:52-60`).

**D. Nothing drops a crop too early in the normal flow.** The one early drop is path 6 during a commit (B above). The stray path drops crops of recognitions that ended after Remove all scans or a sign out, which is what spec #389 asks.

### Rules from the spec

Spec #389 (Scan batch on the phone, Upload queue) and #392, #393, #394 set these rules. ADR 0011 covers only what the server stores and does not touch files on the phone.

- A crop is kept for every saved scan that the scanner saw as a card, and not for a basic land, a recognition with no candidates, a photo that is not a card, or **+1** (user stories 2, 6, 7).
- The file moves to Documents under the user ID and copy ID when the scan enters the scan batch, so it survives a restart.
- Remove scan and Remove all scans delete the crops of the scans they take out (story 17).
- After a commit, crops join the upload queue, or are dropped when the app knows uploads are off.
- An upload that works, or a refusal, deletes the file. A network failure keeps it (stories 11, 13, 16).
- Turning the switch off drops every waiting crop (story 14).
- Each account's waiting crops stay apart (story 19).

Story 12 ("upload when I open the app again after their wait") and story 17 ("nothing is left behind") are where gaps A to C break the spec.

## 2. What would the deepened module need to own?

### The rule it would hold

"A crop file at `training-crops/<user ID>/<copy ID>.jpg` exists only while its scan is in that user's scan batch, or while it waits in that user's upload queue." Today no module states this. Five call sites each keep part of it.

### Callers and rules that would move

| Caller | Today | Would become |
| --- | --- | --- |
| `ScanBatchProvider.recognitionEnded` | `keptTrainingCrop` builds the scan's crop fields and moves or drops the file | Asks the keeper to keep a crop for a copy ID |
| `ScanBatchProvider.dispatch` (remove) | Drops before dispatch | Gone. The keeper sees the scan leave |
| `ScanBatchProvider.removeAll` | Drops all, then resets | Gone. Same |
| Stray crop state, two actions, and an effect | Undo an early move | Gone if the move waits until the scan is in the batch |
| `ScanBatchProvider.commitBatch` | Reads the switch from a ref, then drops or queues | Tells the keeper which copy IDs the commit saved and whether uploads are off |
| `TrainingCropUploadsSettingProvider.setUploadsOn` | Calls `dropWaitingTrainingCrops` | Unchanged call into the keeper |
| `TrainingCropUploads` upload loop | Drops after upload or refusal | Unchanged, plus "a missing file counts as dropped" |
| `scan-batch-file.ts` | Saves the absolute URI | Saves no URI. The keeper derives the path from user ID and copy ID |
| `isCroppedScan`, `evidence-record.ts` | Read crop fields from the scan | Unchanged |

`ScanTrainingCrop` keeps the evidence record fields on the scan. Only the file handling moves.

### Option 1: follow the scan batch by comparing batches

The provider calls the keeper once, in the same effect that writes the scan batch file. The keeper compares the last batch it saw with the new one. A copy ID that left by a commit is queued or dropped. A copy ID that left any other way is dropped. Remove scan, Remove all scans, and any future edit get cleanup for free. The keep move can also wait for this point, so the stray crop machinery goes away. Crops of recognitions that end after a reset stay in Caches, and the keeper drops them when they never show up in a batch.

- Gains: leverage for new edits, locality of the drop rule, and drops happen after the batch is saved, which closes the Remove scan kill window.
- Costs: the keeper must tell a commit apart from a removal, so `commitSucceeded` hands it the saved copy IDs. Remove scan during a commit is still possible and must be blocked in the UI or made harmless. It does not fix gap C.

### Option 2: sweep the folder against the batch and the queue

The keeper lists `training-crops/<user ID>/` and deletes each file whose copy ID is in neither the restored scan batch nor the upload queue. It runs once after restore, under the queue lock, and could run after each commit. The edit paths can stay as they are.

- Gains: one check catches every leak, including the format, parse, and kill window cases in gap C, and any future bug in the edit paths.
- Costs: a folder listing races with a crop that was just moved. Running only after restore, before the user can scan, avoids most of it. A bug here deletes training data, which is permanent. That loses only training crops, never a copy. The fake file system needs `Directory.list()`.

### Option 3: the reducer lists the crops to drop

Generalise the stray crop state. The pure reducer writes "drop these URIs" and "queue these scans" into state for every action that takes a scan out. One effect applies the list.

- Gains: the rule sits beside each edit in the pure reducer, where the batch edits are defined. It matches the existing stray crop pattern.
- Costs: each new reducer case must still remember to add to the list, so leverage is low. The list is in memory, so kill windows stay. The provider's state grows again.

### Changes that every option needs

These are small and fix gaps A and B on their own:

1. Before an upload, a crop whose file is missing counts as dropped (`training-crops.ts:116-120`).
2. Save the copy ID, not the absolute URI. Derive the path from `Paths.document`, the user ID, and the copy ID. This needs scan batch format version 3 and a queue format version 2, each reading the old format (`scan-batch-file.ts:4-17`, `training-crops.ts:22`, `56-61`).
3. Block Remove scan in scan details while a commit runs, as the batch review sheet already does, or drop the scan's crop only after the commit ends.

## 3. What does it cost?

### Files

- `src/scan/training-crops.ts` (or a new `training-crop-keeper.ts` beside it): keep, drop, queue, path rule, and sweep.
- `src/scan/scan-batch-state.tsx`: remove the wrapper in `dispatch`, the drop in `removeAll`, the stray crop state, and the drop or queue branch in `commitBatch`. About 40 lines go (my estimate from the line ranges above).
- `src/scan/scan-batch.ts`: `ScanTrainingCrop` loses `uri` if option 2 of "changes" lands.
- `src/scan/scan-batch-file.ts`, `src/scan/versioned-user-file.ts` (unchanged), and the queue reader: new format versions.
- `src/scan/training-crop-uploads-setting.tsx`: no change to the call.
- `src/components/organisms/scan-details.tsx` or `latest-scan-controls.tsx`: block Remove scan during a commit.
- `test/fake-file-system.ts`: `Directory.list()` for option 2.
- `README.md:139-154`: the file names and the format versions.

### Tests

- `test/training-crops.test.tsx` (813 lines) keeps its 34 tests. They test through `renderApp` and do not name the module. The tests that build a saved batch or queue by hand with absolute URIs (for example the restart test at `762` and the old format test at `786`) change with the format.
- New tests: a waiting crop whose file is gone is dropped and the next one uploads; crop files of an unreadable scan batch file are deleted at start; Remove scan is not offered on the latest-scan chip during a commit; a batch and queue saved with URIs of an old container still upload.
- `test/fake-supabase.ts:1291-1318` could check that the image file exists, so a missing file shows in tests. This fits #411, but the Edge Function is not a database function, so #411's contract table will not cover it.

### Risk

- Deleting a crop that should upload loses training data for good. It never touches a copy or the scan batch. Severity is low.
- A format change to the scan batch file must not drop a user's scans. #392 already set the pattern (`scan-batch-file.ts:6-17`).
- Moving the keep step to the batch effect (option 1) changes when the file leaves Caches. A kill before the effect leaves the crop in Caches and the scan without a file, and the "missing file counts as dropped" change covers it.

### Standards and ADRs

- No ADR conflict. ADR 0011 covers server storage. The keeper stores files per user, as spec #389 asks (story 19).
- `CODING_STANDARDS.md` (Code): "Keep one source of truth for each rule". The drop rule has five copies today, so the change moves toward the standard.
- `CODING_STANDARDS.md` (Tests): tests stay at the app seam with the fake file system, which is an agreed fake.

### Overlap with #410, #411, #412

- #410 (one contract per database function): `add_scan_batch` stays in `commitBatch` (`scan-batch-state.tsx:307-309`). If the keeper lands first, #410 edits one call site in the provider. No dependency either way.
- #411 (fake Supabase client as a thin adapter): the `training-crops` Edge Function stays a hand-written fake. Adding a file check there is a small separate change.
- #412 (one read lifecycle module): it rewrites how `TrainingCropUploadsSettingProvider` reads the switch (`training-crop-uploads-setting.tsx:25-50`). The keeper only uses `setUploadsOn` and the known value. Do them in either order, but not in the same PR.

## 4. Recommendation

**File a bug ticket now, and shape its fix as a small keeper. Keep the strength at Worth exploring.**

- The architecture friction is modest. Five call sites in one 412-line provider, each covered by a test, is not the cost the review's diagram suggests.
- The bugs it hides are real and need no refactor to fix: a missing file can stall the upload queue (gap A), several paths can create one (gap B), and crops of an unreadable batch or queue file are never deleted (gap C).
- The fix touches the same code: derive the path from the copy ID, treat a missing file as dropped, block Remove scan during a commit, and sweep the folder once after restore. Putting those four rules in one keeper module (option 2's sweep plus option 1's "follow the batch") costs little more than the fix.
- It does not depend on #410, #411, or #412.
- Add one step to the owner check in #397, which is still open: update the app while crops wait, then check that they upload. That settles whether the container path changes on this iOS version.

The strength should not go up to Strong. The leverage is one folder of optional files, and no other module would get simpler. It should not go down to Speculative, because the bugs above make the change worth doing soon.
