# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=2"]
# ///
import argparse
import json
import shutil
from pathlib import Path

import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser(description="Write an int8 copy of a float16 catalog gallery.")
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()

    header = json.loads((arguments.source / "gallery.json").read_text())
    vectors = np.fromfile(arguments.source / "gallery.f16", dtype=np.float16)
    vectors = vectors.reshape(header["count"], header["dimension"]).astype(np.float32)
    peaks = np.abs(vectors).max(axis=1, keepdims=True)
    codes = np.clip(np.round(vectors / np.where(peaks > 0, peaks, 1) * 127), -127, 127).astype(np.int8)

    arguments.output.mkdir(parents=True, exist_ok=True)
    codes.tofile(arguments.output / "gallery.i8")
    (arguments.output / "gallery.json").write_text(json.dumps({**header, "encoding": "int8"}))
    shutil.copyfile(arguments.source / "catalog.json", arguments.output / "catalog.json")
    print(json.dumps({"printings": header["count"], "bytes": codes.nbytes}))


if __name__ == "__main__":
    main()
