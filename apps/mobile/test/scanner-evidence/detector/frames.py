# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy==2.5.3", "opencv-python-headless==5.0.0.93", "httpx==0.28.1"]
# ///
import argparse
import asyncio
import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import cv2
import httpx
import numpy as np

FRAME_WIDTH = 720
FRAME_HEIGHT = 1280
CARD_WIDTH_MM = 63.0
CARD_HEIGHT_MM = 88.0
SEED = 20261021
FRAMES_PER_CONDITION = 30
BORDER_COLORS = ["black", "white", "borderless"]
USER_AGENT = "mtgscan/0.1 (detector replay frames)"


@dataclass(frozen=True)
class Pose:
    tilt_degrees: float
    focal_px: float


@dataclass(frozen=True)
class Condition:
    name: str
    surface: Callable[[random.Random], np.ndarray]
    has_card: bool
    pose: Callable[[random.Random], Pose]


async def download(cards, directory):
    directory.mkdir(parents=True, exist_ok=True)
    pending = [card for card in cards if not (directory / f"{card['id']}.jpg").exists()]
    semaphore = asyncio.Semaphore(8)
    failures = []

    async def fetch(client, card):
        async with semaphore:
            for attempt in range(4):
                try:
                    response = await client.get(card["image"])
                    if response.status_code == 200:
                        target = directory / f"{card['id']}.jpg"
                        target.with_suffix(".tmp").write_bytes(response.content)
                        target.with_suffix(".tmp").rename(target)
                        return
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(2**attempt)
            failures.append(card["id"])

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT, "Accept": "image/*"}, timeout=30) as client:
        await asyncio.gather(*(fetch(client, card) for card in pending))
    return failures


def noise(rng, shape, sigma):
    return np.random.default_rng(rng.randrange(1 << 30)).normal(0, sigma, shape).astype(np.float32)


def plain_surface(rng):
    base = np.array([rng.uniform(20, 220) for _ in range(3)], np.float32)
    surface = np.ones((FRAME_HEIGHT, FRAME_WIDTH, 3), np.float32) * base
    angle = rng.uniform(0, 2 * math.pi)
    yy, xx = np.mgrid[0:FRAME_HEIGHT, 0:FRAME_WIDTH].astype(np.float32)
    ramp = (xx * math.cos(angle) + yy * math.sin(angle)) / math.hypot(FRAME_WIDTH, FRAME_HEIGHT)
    surface *= (rng.uniform(0.8, 0.95) + rng.uniform(0.05, 0.3) * ramp)[:, :, None]
    texture = cv2.GaussianBlur(noise(rng, (FRAME_HEIGHT, FRAME_WIDTH), rng.uniform(3, 10)), (0, 0), rng.uniform(1, 6))
    return surface + texture[:, :, None]


def flat(rng):
    return Pose(tilt_degrees=0.0, focal_px=rng.uniform(880, 1000))


def intrinsic_matrix(pose):
    return np.array([[pose.focal_px, 0, FRAME_WIDTH / 2], [0, pose.focal_px, FRAME_HEIGHT / 2], [0, 0, 1]], np.float64)


def rotation(axis_angle, angle):
    axis = np.array([math.cos(axis_angle), math.sin(axis_angle), 0.0])
    skew = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(angle) * skew + (1 - math.cos(angle)) * skew @ skew


def card_homography(rng, pose):
    turn = math.radians(rng.uniform(-20, 20)) + (math.pi if rng.random() < 0.3 else 0.0)
    in_plane = np.array([[math.cos(turn), -math.sin(turn), 0], [math.sin(turn), math.cos(turn), 0], [0, 0, 1]])
    tilt = rotation(rng.uniform(0, 2 * math.pi), math.radians(pose.tilt_degrees))
    orientation = tilt @ in_plane
    distance = pose.focal_px * CARD_WIDTH_MM / rng.uniform(300, 500)
    center = np.array([rng.uniform(0.4, 0.6) * FRAME_WIDTH, rng.uniform(0.4, 0.6) * FRAME_HEIGHT])
    camera_center = np.array([
        (center[0] - FRAME_WIDTH / 2) * distance / pose.focal_px,
        (center[1] - FRAME_HEIGHT / 2) * distance / pose.focal_px,
        distance,
    ])
    plane = np.column_stack([orientation[:, 0], orientation[:, 1], camera_center])
    return intrinsic_matrix(pose) @ plane


def project(homography, points):
    projected = np.column_stack([points, np.ones(len(points))]) @ homography.T
    return projected[:, :2] / projected[:, 2:]


def light(rng, card):
    height = card.shape[0]
    card = card.astype(np.float32)
    card *= np.array([rng.uniform(0.9, 1.05), rng.uniform(0.95, 1.03), rng.uniform(0.9, 1.08)], np.float32)[None, None, :]
    card *= np.linspace(rng.uniform(0.8, 1.0), rng.uniform(0.9, 1.1), height, dtype=np.float32)[:, None, None]
    return card


def place_card(rng, surface, image, pose):
    height, width = image.shape[:2]
    millimetres = np.array([[CARD_WIDTH_MM / width, 0, -CARD_WIDTH_MM / 2], [0, CARD_HEIGHT_MM / height, -CARD_HEIGHT_MM / 2], [0, 0, 1]])
    plane = card_homography(rng, pose)
    to_frame = plane @ millimetres
    half = np.array([[1, 0, 0.5], [0, 1, 0.5], [0, 0, 1]])
    pixel_centres = np.linalg.inv(half) @ to_frame @ half
    card = light(rng, image)
    warped = cv2.warpPerspective(card, pixel_centres, (FRAME_WIDTH, FRAME_HEIGHT), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    coverage = cv2.warpPerspective(np.ones((height, width), np.float32), pixel_centres, (FRAME_WIDTH, FRAME_HEIGHT), flags=cv2.INTER_LINEAR)
    frame = surface * (1 - coverage[:, :, None]) + warped * coverage[:, :, None]
    corners = project(plane, np.array([[-1, -1], [1, -1], [1, 1], [-1, 1]]) * [CARD_WIDTH_MM / 2, CARD_HEIGHT_MM / 2])
    return frame, corners


def camera(rng, frame):
    frame = cv2.GaussianBlur(frame, (0, 0), rng.uniform(0.4, 1.0))
    frame = frame + noise(rng, frame.shape, rng.uniform(1, 4))
    return np.clip(frame, 0, 255).astype(np.uint8)


CONDITIONS = [
    Condition("plain", plain_surface, True, flat),
    Condition("empty-plain", plain_surface, False, flat),
]


def card_for(cards, index):
    by_color = [card for card in cards if card["borderColor"] == BORDER_COLORS[index % len(BORDER_COLORS)]]
    return by_color[(index // len(BORDER_COLORS)) % len(by_color)]


def render(condition, index, cards, images):
    rng = random.Random(f"{SEED}:{condition.name}:{index}")
    pose = condition.pose(rng)
    frame = condition.surface(rng)
    card = card_for(cards, index) if condition.has_card else None
    corners = None
    if card:
        image = cv2.imread(str(images / f"{card['id']}.jpg"), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"cannot read the image of {card['id']}")
        frame, corners = place_card(rng, frame, image, pose)
    label = {
        "frame": f"{condition.name}-{index:03d}.png",
        "condition": condition.name,
        "scryfallId": card["id"] if card else None,
        "borderColor": card["borderColor"] if card else None,
        "corners": corners.round(4).tolist() if corners is not None else None,
        "tiltDegrees": pose.tilt_degrees,
        "intrinsicMatrix": intrinsic_matrix(pose).round(4).tolist(),
    }
    return camera(rng, frame), label


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cards", required=True)
    parser.add_argument("--images", required=True)
    parser.add_argument("--output", required=True)
    arguments = parser.parse_args()
    cards = json.loads(Path(arguments.cards).read_text())["cards"]
    images = Path(arguments.images)
    failures = asyncio.run(download(cards, images))
    if failures:
        raise SystemExit(f"{len(failures)} card images did not download, first: {failures[0]}")
    output = Path(arguments.output)
    output.mkdir(parents=True, exist_ok=True)
    labels = []
    for condition in CONDITIONS:
        for index in range(FRAMES_PER_CONDITION):
            frame, label = render(condition, index, cards, images)
            cv2.imwrite(str(output / label["frame"]), frame, [cv2.IMWRITE_PNG_COMPRESSION, 3])
            labels.append(label)
    labels_file = {"frameWidth": FRAME_WIDTH, "frameHeight": FRAME_HEIGHT, "cardMm": [CARD_WIDTH_MM, CARD_HEIGHT_MM], "frames": labels}
    (output / "labels.json").write_text(json.dumps(labels_file, indent=1) + "\n")
    print(json.dumps({"frames": len(labels)}))


if __name__ == "__main__":
    main()
