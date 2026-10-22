# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy==2.5.3", "opencv-python-headless==5.0.0.93"]
# ///
import argparse
import json
import statistics
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np

CARD_WIDTH, CARD_HEIGHT = 488, 680
PX_PER_MM = CARD_WIDTH / 63
CORRELATION_FLOOR = 0.6
INSIDE_MM = 1.0
ECC_CRITERIA = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6)
SCRYFALL_IMAGE = "https://api.scryfall.com/cards/{}?format=image&version=normal"
USER_AGENT = "mtgscan/0.1 (training crop scorer)"


def grey(path):
    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise SystemExit(f"Could not read {path}")
    return cv2.resize(image, (CARD_WIDTH, CARD_HEIGHT), interpolation=cv2.INTER_AREA)


def edges(image):
    image = image.astype(np.float32)
    gx = cv2.Sobel(image, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(image, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = cv2.GaussianBlur(np.hypot(gx, gy), (0, 0), 1.5)
    return magnitude / (magnitude.max() + 1e-6)


def affine_start(reference, crop):
    sift = cv2.SIFT_create()
    reference_points, reference_descriptors = sift.detectAndCompute(reference, None)
    crop_points, crop_descriptors = sift.detectAndCompute(crop, None)
    if reference_descriptors is None or crop_descriptors is None or len(crop_descriptors) < 2:
        return None
    pairs = cv2.BFMatcher().knnMatch(reference_descriptors, crop_descriptors, k=2)
    matches = [best for best, second in (pair for pair in pairs if len(pair) == 2) if best.distance < 0.75 * second.distance]
    if len(matches) < 8:
        return None
    affine, _ = cv2.estimateAffine2D(
        np.float32([reference_points[m.queryIdx].pt for m in matches]),
        np.float32([crop_points[m.trainIdx].pt for m in matches]),
        method=cv2.RANSAC,
        ransacReprojThreshold=3,
    )
    return None if affine is None else affine.astype(np.float32)


def scale_start(scale):
    return np.float32([[scale, 0, CARD_WIDTH / 2 * (1 - scale)], [0, scale, CARD_HEIGHT / 2 * (1 - scale)]])


def align(reference, crop):
    starts = [scale_start(scale) for scale in (1.0, 0.94, 1.06)]
    sift = affine_start(reference, crop)
    if sift is not None:
        starts.insert(0, sift)
    template, moving = edges(reference), edges(crop)
    best = (-1.0, None)
    for start in starts:
        try:
            correlation, warp = cv2.findTransformECC(template, moving, start, cv2.MOTION_AFFINE, ECC_CRITERIA, None, 5)
        except cv2.error:
            continue
        if correlation > best[0]:
            best = (correlation, warp)
    return best


def sides_mm(warp):
    on_card = np.linalg.inv(np.vstack([warp, [0, 0, 1]])) @ np.array(
        [[0, CARD_WIDTH, CARD_WIDTH, 0], [0, 0, CARD_HEIGHT, CARD_HEIGHT], [1, 1, 1, 1]], np.float64
    )
    x, y = on_card[0].tolist(), on_card[1].tolist()
    return {
        "left": (x[0] + x[3]) / 2 / PX_PER_MM,
        "right": (CARD_WIDTH - (x[1] + x[2]) / 2) / PX_PER_MM,
        "top": (y[0] + y[1]) / 2 / PX_PER_MM,
        "bottom": (CARD_HEIGHT - (y[2] + y[3]) / 2) / PX_PER_MM,
    }


def score_crop(crop_path, reference_path):
    correlation, warp = align(grey(reference_path), grey(crop_path))
    if warp is None or correlation < CORRELATION_FLOOR:
        return {"correlation": round(float(correlation), 3), "scored": False}
    sides = sides_mm(warp)
    return {
        "correlation": round(float(correlation), 3),
        "scored": True,
        "inside": max(sides.values()) > INSIDE_MM,
        "sidesMm": {side: round(value, 2) for side, value in sides.items()},
        "sizeMm": {
            "width": round((sides["left"] + sides["right"]) / 2, 2),
            "height": round((sides["top"] + sides["bottom"]) / 2, 2),
        },
        "shiftMm": {
            "horizontal": round((sides["left"] - sides["right"]) / 2, 2),
            "vertical": round((sides["top"] - sides["bottom"]) / 2, 2),
        },
    }


def reference_image(images, printing_id):
    path = images / f"{printing_id}.jpg"
    if not path.exists():
        images.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(SCRYFALL_IMAGE.format(printing_id), headers={"User-Agent": USER_AGENT, "Accept": "image/*"})
        with urllib.request.urlopen(request) as response:
            path.with_suffix(".tmp").write_bytes(response.read())
        path.with_suffix(".tmp").rename(path)
        time.sleep(0.1)
    return path


def build_totals(crops):
    totals = {}
    for crop in crops:
        build = totals.setdefault(crop["appBuild"], {"appBuild": crop["appBuild"], "crops": 0, "scored": 0, "unscored": 0, "insideOutlines": 0})
        build["crops"] += 1
        build["scored" if crop["scored"] else "unscored"] += 1
        build["insideOutlines"] += crop["scored"] and crop["inside"]
    return sorted(totals.values(), key=lambda build: build["appBuild"])


def median(crops, measure, axis):
    values = [crop[measure][axis] for crop in crops if crop["scored"]]
    return f"{statistics.median(values):+.1f}" if values else "-"


def print_report(crops, builds):
    print("| App build | Crops | Scored | Unscored | Inside outlines | Median size, width mm | Median size, height mm |")
    print("| --- | --: | --: | --: | --: | --: | --: |")
    for build in builds:
        of_build = [crop for crop in crops if crop["appBuild"] == build["appBuild"]]
        print(
            f"| {build['appBuild']} | {build['crops']} | {build['scored']} | {build['unscored']} | {build['insideOutlines']} "
            f"| {median(of_build, 'sizeMm', 'width')} | {median(of_build, 'sizeMm', 'height')} |"
        )
    inside = [crop for crop in crops if crop["scored"] and crop["inside"]]
    print(f"\nInside outlines: {len(inside)}\n")
    if inside:
        print("| Crop | App build | Card printing | Left mm | Right mm | Top mm | Bottom mm | Size, width mm | Size, height mm | Shift, horizontal mm | Shift, vertical mm |")
        print("| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: |")
        for crop in inside:
            sides, size, shift = crop["sidesMm"], crop["sizeMm"], crop["shiftMm"]
            print(
                f"| {crop['crop']} | {crop['appBuild']} | {crop['scryfallId']} "
                f"| {sides['left']:+.1f} | {sides['right']:+.1f} | {sides['top']:+.1f} | {sides['bottom']:+.1f} "
                f"| {size['width']:+.1f} | {size['height']:+.1f} | {shift['horizontal']:+.1f} | {shift['vertical']:+.1f} |"
            )
    unscored = [crop for crop in crops if not crop["scored"]]
    if unscored:
        print(f"\nUnscored, below the correlation floor of {CORRELATION_FLOOR}: {len(unscored)}\n")
        for crop in unscored:
            print(f"- {crop['crop']}, correlation {crop['correlation']}")


def main():
    parser = argparse.ArgumentParser(description="Scores training crops against the Scryfall normal image of each saved card printing.")
    parser.add_argument("folder", type=Path, help="A folder that bun run crops pull wrote")
    parser.add_argument("--images", type=Path, default=Path.home() / "Library" / "Caches" / "mtgscan" / "scryfall-images")
    parser.add_argument("--output", type=Path, help="Where to write the scores; <folder>/crop-scores.json by default")
    args = parser.parse_args()

    labels = json.loads((args.folder / "labels.json").read_text())["cards"]
    builds = {record["crop_id"]: record["recognizer_version"] for record in json.loads((args.folder / "evidence.json").read_text())}
    crops = []
    for card in labels:
        reference = reference_image(args.images, card["scryfallId"])
        crops.append(
            {
                "crop": card["crop"],
                "scryfallId": card["scryfallId"],
                "appBuild": builds[Path(card["crop"]).stem],
                **score_crop(args.folder / card["crop"], reference),
            }
        )
    totals = build_totals(crops)
    output = args.output or args.folder / "crop-scores.json"
    output.write_text(json.dumps({"correlationFloor": CORRELATION_FLOOR, "builds": totals, "crops": crops}, indent=1) + "\n")
    print_report(crops, totals)
    print(f"\nWrote {output}")


if __name__ == "__main__":
    main()
