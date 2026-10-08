# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=2"]
# ///
import argparse
import json
from pathlib import Path

import numpy as np

DEPTHS = (1, 5, 20, 50)


def load_gallery(directory: Path) -> tuple[np.ndarray, list[dict]]:
    header = json.loads((directory / "gallery.json").read_text())
    shape = (header["count"], header["dimension"])
    encoding = header.get("encoding", "float16")
    if encoding == "float16":
        vectors = np.fromfile(directory / "gallery.f16", dtype=np.float16).reshape(shape).astype(np.float32)
    elif encoding == "int8":
        vectors = np.fromfile(directory / "gallery.i8", dtype=np.int8).reshape(shape).astype(np.float32)
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        vectors = (vectors / np.where(norms > 0, norms, 1)).astype(np.float16).astype(np.float32)
    else:
        raise SystemExit(f"unknown gallery encoding {encoding}")
    return vectors, json.loads((directory / "catalog.json").read_text())


def main() -> None:
    parser = argparse.ArgumentParser(description="Shortlist recall of a gallery for embedded label vectors.")
    parser.add_argument("labels", type=Path)
    parser.add_argument("vectors", type=Path)
    parser.add_argument("catalogs", type=Path, nargs="+")
    arguments = parser.parse_args()

    cards = json.loads(arguments.labels.read_text())["cards"]
    queries = np.fromfile(arguments.vectors, dtype=np.float32).reshape(-1, 2, 768)[: len(cards)]
    report = {}
    for directory in arguments.catalogs:
        gallery, catalog = load_gallery(directory)
        index_by_id = {printing["id"]: index for index, printing in enumerate(catalog)}
        oracle = np.array([printing["oracleId"] for printing in catalog])
        printing_ranks, name_ranks = [], []
        for card, pair in zip(cards, queries):
            truth = index_by_id[card["scryfallId"]]
            scores = pair @ gallery.T
            best = scores[int(scores[1].max() > scores[0].max())]
            printing_ranks.append(int((best > best[truth]).sum()) + 1)
            name_ranks.append(int((best > best[oracle == oracle[truth]].max()).sum()) + 1)
        printing_ranks, name_ranks = np.array(printing_ranks), np.array(name_ranks)
        report[str(directory)] = {
            "cards": len(cards),
            **{f"nameAt{depth}": float((name_ranks <= depth).mean()) for depth in DEPTHS},
            **{f"printingAt{depth}": float((printing_ranks <= depth).mean()) for depth in DEPTHS},
        }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
