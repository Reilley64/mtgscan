# Embedding research scripts

Scripts and summary results for #430. The notes are in `docs/research/embedding-vs-vision-feature-print.md`.

They first ran in `/tmp/embed-exp`. The full data (embeddings, galleries, Core ML and LiteRT models, replay runs, reference crops) is on the owner's Mac in `~/Library/Caches/mtgscan/embedding-research`, in the same layout. Virtual environments were not kept. The scripts still name `/tmp/embed-exp` in their paths.

| Path | Step |
| --- | --- |
| `download.py`, `models.py`, `embed.py`, `evaluate.py`, `featureprint.swift` | Zero-shot check on the 4,456-printing subset (section 8) |
| `tune.py`, `prep_models.py`, `common.py`, `full.py`, `eval_full.py` | Preprocessing choice and the full-gallery screen (section 9) |
| `step1b/` | Recognizer replay with open embeddings (section 10). The recognizer changes are in `apps/mobile/modules/card-recognizer` on this branch. |
| `step1c/` | Core ML and LiteRT conversion and phone checks (section 11). The iPhone bench app is `prototypes/embed-bench`. |
