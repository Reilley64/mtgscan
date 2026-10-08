# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "opencv-python-headless", "httpx"]
# ///
import argparse
import asyncio
import gzip
import json
import math
import random
from pathlib import Path

import cv2
import httpx
import numpy as np

EXCLUDED_LAYOUTS = {"token", "art_series", "emblem", "double_faced_token", "front_card", "vanguard", "planar", "scheme"}
SPECIAL_EFFECTS = {"showcase", "extendedart", "inverted", "etched", "shatteredglass"}
USER_AGENT = "mtgscan-prototype/0.1 (recognizer simulation)"


def paper_printings(bulk_path):
    with gzip.open(bulk_path, "rt") as handle:
        for raw in handle:
            line = raw.strip().rstrip(",")
            if not line or line in "[]":
                continue
            card = json.loads(line)
            if "paper" not in card.get("games", []) or card.get("digital") or card.get("layout") in EXCLUDED_LAYOUTS:
                continue
            face = (card.get("card_faces") or [card])[0]
            image = (card.get("image_uris") or face.get("image_uris") or {}).get("large")
            if image:
                yield card, face, image


def choose(bulk_path, counts, seed):
    rng = random.Random(seed)
    cards = list(paper_printings(bulk_path))
    by_illustration = {}
    for card, face, _ in cards:
        illustration = card.get("illustration_id") or face.get("illustration_id")
        if illustration:
            by_illustration.setdefault(illustration, []).append(card["id"])

    def group_of(card, face):
        if card["frame"] in ("1993", "1997", "2003"):
            return "old-frame"
        effects = set(card.get("frame_effects") or [])
        if card["set"] == "sld" or effects & SPECIAL_EFFECTS or card.get("full_art") or card.get("border_color") == "borderless":
            return "special"
        illustration = card.get("illustration_id") or face.get("illustration_id")
        if illustration and len(by_illustration.get(illustration, [])) > 1:
            return "same-art"
        return "single-art"

    pools = {}
    for card, face, image in cards:
        pools.setdefault(group_of(card, face), []).append({"id": card["id"], "image": image, "group": group_of(card, face)})
    chosen = []
    for group, count in counts.items():
        pool = pools.get(group, [])
        chosen.extend(rng.sample(pool, min(count, len(pool))))
    return chosen


async def download(entries, directory):
    directory.mkdir(parents=True, exist_ok=True)
    pending = [entry for entry in entries if not (directory / f"{entry['id']}.jpg").exists()]
    semaphore = asyncio.Semaphore(8)
    failures = []

    async def fetch(client, entry):
        async with semaphore:
            for attempt in range(4):
                try:
                    response = await client.get(entry["image"])
                    if response.status_code == 200:
                        target = directory / f"{entry['id']}.jpg"
                        target.with_suffix(".tmp").write_bytes(response.content)
                        target.with_suffix(".tmp").rename(target)
                        return
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(2**attempt)
            failures.append(entry["id"])

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT, "Accept": "image/*"}, timeout=30) as client:
        await asyncio.gather(*(fetch(client, entry) for entry in pending))
    return failures


def background(rng, width, height):
    base = np.array([rng.uniform(20, 220) for _ in range(3)], dtype=np.float32)
    image = np.ones((height, width, 3), np.float32) * base
    gradient = np.linspace(rng.uniform(0.7, 1.0), rng.uniform(0.9, 1.2), width, dtype=np.float32)
    image *= gradient[None, :, None]
    noise = np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(4, 18), (height, width)).astype(np.float32)
    texture = cv2.GaussianBlur(noise, (0, 0), rng.uniform(1, 6))
    return np.clip(image + texture[:, :, None], 0, 255)


def glare(rng, height, width, bottom):
    layer = np.zeros((height, width), np.float32)
    for _ in range(rng.randint(1, 2)):
        cx = rng.uniform(0.1, 0.9) * width
        cy = rng.uniform(0.86, 0.97) * height if bottom else rng.uniform(0.05, 0.95) * height
        sx, sy = rng.uniform(0.08, 0.35) * width, rng.uniform(0.02, 0.12) * height
        angle = rng.uniform(0, math.pi)
        yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
        x, y = xx - cx, yy - cy
        u = x * math.cos(angle) + y * math.sin(angle)
        v = -x * math.sin(angle) + y * math.cos(angle)
        layer = np.maximum(layer, np.exp(-((u / sx) ** 2 + (v / sy) ** 2)) * rng.uniform(0.25, 0.85))
    return layer


def degrade_card(rng, card):
    height, width = card.shape[:2]
    card = card.astype(np.float32)
    temperature = np.array([rng.uniform(0.85, 1.1), rng.uniform(0.9, 1.05), rng.uniform(0.8, 1.15)], np.float32)
    card *= temperature[None, None, :]
    shade = np.linspace(rng.uniform(0.6, 1.0), rng.uniform(0.85, 1.15), height, dtype=np.float32)
    card *= shade[:, None, None]
    if rng.random() < 0.35:
        veil = rng.uniform(0.04, 0.14)
        card = card * (1 - veil) + 255 * veil
    if rng.random() < 0.6:
        layer = glare(rng, height, width, bottom=rng.random() < 0.3)
        card = card * (1 - layer[:, :, None]) + 255 * layer[:, :, None]
    return np.clip(card, 0, 255)


def render(rng, source, card_height):
    card = cv2.imread(str(source), cv2.IMREAD_COLOR)
    if card is None:
        raise ValueError(f"cannot read {source}")
    card_width = round(card_height * 63 / 88)
    card = cv2.resize(card, (card_width, card_height), interpolation=cv2.INTER_CUBIC)
    card = degrade_card(rng, card)
    margin = round(card_height * rng.uniform(0.15, 0.35))
    width, height = card_width + 2 * margin, card_height + 2 * margin
    photo = background(rng, width, height)
    turned = rng.random() < 0.3
    corners = np.array([[0, 0], [card_width, 0], [card_width, card_height], [0, card_height]], np.float32)
    if turned:
        corners = corners[[2, 3, 0, 1]]
    angle = math.radians(rng.uniform(-15, 15))
    center = np.array([width / 2, height / 2], np.float32)
    placed = []
    for corner in [[0, 0], [card_width, 0], [card_width, card_height], [0, card_height]]:
        x, y = corner[0] - card_width / 2, corner[1] - card_height / 2
        rx = x * math.cos(angle) - y * math.sin(angle)
        ry = x * math.sin(angle) + y * math.cos(angle)
        jitter = np.array([rng.uniform(-0.04, 0.04) * card_width, rng.uniform(-0.04, 0.04) * card_height], np.float32)
        placed.append(center + np.array([rx, ry], np.float32) + jitter)
    placed = np.array(placed, np.float32)
    matrix = cv2.getPerspectiveTransform(corners, placed)
    warped = cv2.warpPerspective(card, matrix, (width, height), flags=cv2.INTER_LINEAR)
    mask = cv2.warpPerspective(np.ones((card_height, card_width), np.float32), matrix, (width, height))
    photo = photo * (1 - mask[:, :, None]) + warped * mask[:, :, None]
    if rng.random() < 0.25:
        length = rng.randint(3, 9)
        kernel = np.zeros((length, length), np.float32)
        kernel[length // 2, :] = 1 / length
        rotation = cv2.getRotationMatrix2D((length / 2, length / 2), rng.uniform(0, 180), 1)
        photo = cv2.filter2D(photo, -1, cv2.warpAffine(kernel, rotation, (length, length)))
    sigma = rng.uniform(0, 2.0)
    if sigma > 0.3:
        photo = cv2.GaussianBlur(photo, (0, 0), sigma)
    photo += np.random.default_rng(rng.randrange(1 << 30)).normal(0, rng.uniform(1, 6), photo.shape).astype(np.float32)
    photo = np.clip(photo, 0, 255).astype(np.uint8)
    quad_jitter = 0.006 * card_height
    detected = [
        [float(x + rng.uniform(-quad_jitter, quad_jitter)) / width, float(y + rng.uniform(-quad_jitter, quad_jitter)) / height]
        for x, y in placed
    ]
    start = min(range(4), key=lambda index: detected[index][0] ** 2 + detected[index][1] ** 2)
    ordered = detected[start:] + detected[:start]
    return photo, ordered, {"turned": turned, "blur": round(sigma, 2), "angle": round(math.degrees(angle), 1)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bulk", required=True)
    parser.add_argument("--images", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--seed", type=int, default=20261008)
    parser.add_argument("--same-art", type=int, default=1500)
    parser.add_argument("--single-art", type=int, default=800)
    parser.add_argument("--special", type=int, default=400)
    parser.add_argument("--old-frame", type=int, default=300)
    arguments = parser.parse_args()
    counts = {"same-art": arguments.same_art, "single-art": arguments.single_art, "special": arguments.special, "old-frame": arguments.old_frame}
    entries = choose(arguments.bulk, counts, arguments.seed)
    failures = asyncio.run(download(entries, Path(arguments.images)))
    output = Path(arguments.output)
    output.mkdir(parents=True, exist_ok=True)
    rng = random.Random(arguments.seed)
    cards = []
    for index, entry in enumerate(entries):
        if entry["id"] in failures:
            continue
        photo, quad, conditions = render(rng, Path(arguments.images) / f"{entry['id']}.jpg", rng.randint(1300, 1900))
        path = output / f"sim-{index:05d}.jpg"
        cv2.imwrite(str(path), photo, [cv2.IMWRITE_JPEG_QUALITY, rng.randint(70, 92)])
        cards.append({"photo": str(path), "quad": quad, "scryfallId": entry["id"], "group": entry["group"], "conditions": conditions})
    (output / "labels.json").write_text(json.dumps({"cards": cards}))
    print(json.dumps({"rendered": len(cards), "downloadFailures": len(failures), "groups": {group: sum(1 for card in cards if card["group"] == group) for group in counts}}))


if __name__ == "__main__":
    main()
