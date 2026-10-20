# Step 1b summary: recognizer replay with zero-shot embeddings (int8 gallery)

Thresholds re-tuned by leave-one-art-out (LOAO): each scan uses not-a-card = midpoint(best non-card, worst card) and art margin = smallest 0.0025 step above every gate-breaking unread accept, both fitted on all other arts (real + simulated). Orientation margin kept at 0.03: it changes no decision, only whether the 2nd collector-line read runs (checked).

| Model | Gate 1 correct / wrong card / wrong printing / non-cards / unread / abstain | G1 held out accepts | Gate 1 | Gate 2 correct / wrong card / unread | G2 held out wrong card | Gate 2 |
|---|---|---|---|---|---|---|
| Vision shipped 0.5/0.03 | 214 / 0 / 0 / 11 of 11 / 14 / 36 | 0 | pass | 2135 / 0 / 91 | 0 | pass |
| Vision, same LOAO rule | 215 / 0 / 0 / 11 / 15 / 35 | 0 | pass | 2136 / 0 / 92 | 1 | FAIL |
| SigLIP 2 B/16 | 213 / 0 / 0 / 11 / 11 / 37 | 1 | FAIL | 2120 / 0 / 74 | 3 | FAIL |
| PE-Core S16 | 216 / 0 / 0 / 11 / 15 / 34 | 0 | pass | 2141 / 0 / 95 | 1 | FAIL |
| PE-Core B16 | 213 / 0 / 0 / 11 / 14 / 37 | 1 | FAIL | 2137 / 0 / 90 | 1 | FAIL |

Verdict: the embedding gain carries through only partly, and no model passes every gate under the strict rule. Vision fails too under the same rule, so the rule is harsh. Each model's worst unread case fails once.
- PE-Core S16 (24M, the smallest) is the only open model whose sole failure is that case (Penance accepted for Demonic Consultation, margin 0.024, true card missing). With thresholds fitted on all the data (0.689/0.025) it passes all 4 gates, beats Vision on correct accepts (216 vs 214 and 2141 vs 2135) and unread accepts (15 vs 14), and has a wider non-card gap. Its K99 is still 20-21, above the 15 line.
- SigLIP 2 and PE-Core B16 fail Gate 2 held out through the set-code rule (3 and 1 wrong cards; "set X leaves one printing of the top card" when the true card is missing). No cosine threshold controls that rule. Both also get 213 correct (bar 214). SigLIP needs an art margin of 0.0775 to block a same-text twin (Athreos plst JOU-146) in Gate 1 held out, which leaves 11 unread accepts vs Vision's 14.
- int8 vs float16: no accept count moves by more than 1 scan, and every gate gives the same result. K99 on the recognizer inputs: 11 to 9 (SigLIP), 21 to 20 (S16), 19 to 18 (B16).
Details: /tmp/embed-exp/step1b/results.json, worktree branch prototype/embedding-replay, local commit a4c9753, not pushed, doc section 10.
