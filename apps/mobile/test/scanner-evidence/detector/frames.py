# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy==2.5.3", "opencv-python-headless==5.0.0.93", "httpx==0.28.1"]
# ///
import argparse
import asyncio
import json
import math
import random
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, replace
from functools import partial
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
FRAMES_PER_BUCKET = 30
BORDER_COLORS = ["black", "white", "borderless"]
PHOTO_WIDTH = 2268
PHOTO_HEIGHT = 4032
ANALYSIS_INTERVAL_MS = 200
CLIP_FRAMES = 10
CLIPS_PER_CONDITION = 5
CLIP_CONDITIONS = ["plain", "patterned", "shadow", "sleeve"]
REST_MS = 600
PHOTO_AFTER_STILL_MS = 400
PHOTO_DELAY_MS = (100, 300)
EXPOSURE_MS = 1000 / 60
USER_AGENT = "mtgscan/0.1 (detector replay frames)"
SKIN = [(236, 192, 160), (198, 134, 96), (141, 85, 54), (84, 52, 36)]
PATTERN_LETTERS = "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789"


@dataclass(frozen=True)
class View:
    warp: np.ndarray
    width: int
    height: int


FRAME_VIEW = View(np.eye(3), FRAME_WIDTH, FRAME_HEIGHT)


@dataclass(frozen=True)
class Pose:
    tilt_degrees: float
    focal_px: float
    view: View = FRAME_VIEW


@dataclass(frozen=True)
class TiltBucket:
    name: str
    low: float
    high: float


@dataclass(frozen=True)
class Assets:
    cards: list
    images: Path
    textures: list
    texture_images: Path


@dataclass(frozen=True)
class Condition:
    name: str
    has_card: bool
    scene: Callable


TILT_BUCKETS = [TiltBucket("0", 0, 0), TiltBucket("0-7.5", 0, 7.5), TiltBucket("7.5-15", 7.5, 15), TiltBucket("15-25", 15, 25)]


async def download(items, directory):
    directory.mkdir(parents=True, exist_ok=True)
    pending = [item for item in items if not (directory / f"{item['id']}.jpg").exists()]
    semaphore = asyncio.Semaphore(8)
    failures = []

    async def fetch(client, item):
        async with semaphore:
            for attempt in range(4):
                try:
                    response = await client.get(item["image"])
                    if response.status_code == 200:
                        target = directory / f"{item['id']}.jpg"
                        target.with_suffix(".tmp").write_bytes(response.content)
                        target.with_suffix(".tmp").rename(target)
                        return
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(2**attempt)
            failures.append(item["id"])

    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT, "Accept": "image/*"}, timeout=30) as client:
        await asyncio.gather(*(fetch(client, item) for item in pending))
    return failures


def read_image(path):
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"cannot read {path}")
    return image


def noise(rng, shape, sigma):
    return np.random.default_rng(rng.randrange(1 << 30)).normal(0, sigma, shape).astype(np.float32)


def plain_surface(rng, view):
    base = np.array([rng.uniform(20, 220) for _ in range(3)], np.float32)
    surface = np.ones((FRAME_HEIGHT, FRAME_WIDTH, 3), np.float32) * base
    angle = rng.uniform(0, 2 * math.pi)
    yy, xx = np.mgrid[0:FRAME_HEIGHT, 0:FRAME_WIDTH].astype(np.float32)
    ramp = (xx * math.cos(angle) + yy * math.sin(angle)) / math.hypot(FRAME_WIDTH, FRAME_HEIGHT)
    surface *= (rng.uniform(0.8, 0.95) + rng.uniform(0.05, 0.3) * ramp)[:, :, None]
    texture = cv2.GaussianBlur(noise(rng, (FRAME_HEIGHT, FRAME_WIDTH), rng.uniform(3, 10)), (0, 0), rng.uniform(1, 6))
    surface = surface + texture[:, :, None]
    return surface if view is FRAME_VIEW else warp_into_frame(surface, view.warp, view, border=cv2.BORDER_REFLECT_101)


def pose_in(rng, bucket):
    tilt = rng.uniform(bucket.low, bucket.high) if bucket.high > 0 else 0.0
    return Pose(tilt_degrees=tilt, focal_px=rng.uniform(880, 1000))


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
    return pose.view.warp @ (intrinsic_matrix(pose) @ plane)


def project(homography, points):
    projected = np.column_stack([points, np.ones(len(points))]) @ homography.T
    return projected[:, :2] / projected[:, 2:]


def plane_points(plane, view):
    yy, xx = np.mgrid[0 : view.height, 0 : view.width].astype(np.float64)
    pixels = np.stack([xx + 0.5, yy + 0.5, np.ones_like(xx)], axis=-1) @ np.linalg.inv(plane).T
    return pixels[:, :, 0] / pixels[:, :, 2], pixels[:, :, 1] / pixels[:, :, 2]


def warp_into_frame(image, to_frame, view, border=cv2.BORDER_REPLICATE):
    half = np.array([[1, 0, 0.5], [0, 1, 0.5], [0, 0, 1]])
    pixel_centres = np.linalg.inv(half) @ to_frame @ half
    return cv2.warpPerspective(image, pixel_centres, (view.width, view.height), flags=cv2.INTER_LINEAR, borderMode=border)


def polygon_mask(plane, points_mm, view, blur_px=0.0):
    points = (project(plane, np.asarray(points_mm, np.float64)) - 0.5) * 16
    mask = np.zeros((view.height, view.width), np.uint8)
    cv2.fillPoly(mask, [np.round(points).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=4)
    mask = mask.astype(np.float32) / 255
    return cv2.GaussianBlur(mask, (0, 0), blur_px) if blur_px > 0 else mask


def card_rectangle(margin_mm=0.0, offset_mm=(0.0, 0.0)):
    half_width, half_height = CARD_WIDTH_MM / 2 + margin_mm, CARD_HEIGHT_MM / 2 + margin_mm
    return [(offset_mm[0] + x * half_width, offset_mm[1] + y * half_height) for x, y in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]


def light(rng, card):
    height = card.shape[0]
    card = card.astype(np.float32)
    card *= np.array([rng.uniform(0.9, 1.05), rng.uniform(0.95, 1.03), rng.uniform(0.9, 1.08)], np.float32)[None, None, :]
    card *= np.linspace(rng.uniform(0.8, 1.0), rng.uniform(0.9, 1.1), height, dtype=np.float32)[:, None, None]
    return card


def lay_card(rng, surface, image, plane, view):
    height, width = image.shape[:2]
    millimetres = np.array([[CARD_WIDTH_MM / width, 0, -CARD_WIDTH_MM / 2], [0, CARD_HEIGHT_MM / height, -CARD_HEIGHT_MM / 2], [0, 0, 1]])
    to_frame = plane @ millimetres
    card = light(rng, image)
    warped = warp_into_frame(card, to_frame, view)
    coverage = warp_into_frame(np.ones((height, width), np.float32), to_frame, view, border=cv2.BORDER_CONSTANT)
    frame = surface * (1 - coverage[:, :, None]) + warped * coverage[:, :, None]
    corners = project(plane, np.array(card_rectangle()))
    return frame, corners, coverage


def colour(rng):
    return np.array([rng.uniform(15, 240) for _ in range(3)], np.float32)


def two_tone(rng, ink):
    dark = np.array([rng.uniform(0, 70) for _ in range(3)], np.float32)
    light = np.array([rng.uniform(170, 255) for _ in range(3)], np.float32)
    return dark[None, None, :] * (1 - ink[:, :, None]) + light[None, None, :] * ink[:, :, None]


def turned(rng, u, v):
    angle = rng.uniform(0, math.pi)
    return u * math.cos(angle) + v * math.sin(angle), -u * math.sin(angle) + v * math.cos(angle)


def soft_step(values, width):
    return np.clip(0.5 + values / width, 0, 1).astype(np.float32)


def log_uniform(rng, low, high):
    return math.exp(rng.uniform(math.log(low), math.log(high)))


def stripes(rng, plane, assets, view):
    u, _ = turned(rng, *plane_points(plane, view))
    period = log_uniform(rng, 1.5, 30)
    return two_tone(rng, soft_step(np.sin(2 * math.pi * u / period), 0.3))


def checks(rng, plane, assets, view):
    u, v = turned(rng, *plane_points(plane, view))
    size = log_uniform(rng, 2, 40)
    return two_tone(rng, soft_step(np.sin(math.pi * u / size) * np.sin(math.pi * v / size), 0.15))


def grid(rng, plane, assets, view):
    u, v = turned(rng, *plane_points(plane, view))
    spacing, line = rng.uniform(5, 20), rng.uniform(0.3, 1.0)
    distance = np.minimum(np.abs((u + spacing / 2) % spacing - spacing / 2), np.abs((v + spacing / 2) % spacing - spacing / 2))
    return two_tone(rng, soft_step(line / 2 - distance, 0.3))


def dots(rng, plane, assets, view):
    u, v = turned(rng, *plane_points(plane, view))
    spacing = rng.uniform(5, 25)
    radius = spacing * rng.uniform(0.15, 0.4)
    distance = np.hypot((u + spacing / 2) % spacing - spacing / 2, (v + spacing / 2) % spacing - spacing / 2)
    return two_tone(rng, soft_step(radius - distance, 0.3))


def text(rng, plane, assets, view):
    pixels_per_mm = 4
    size_mm = 300
    page = np.full((size_mm * pixels_per_mm, size_mm * pixels_per_mm, 3), colour(rng)[None, None, :], np.uint8)
    ink = tuple(int(value) for value in colour(rng))
    line_mm = rng.uniform(3, 8)
    for row in range(int(size_mm / line_mm)):
        words = "".join(rng.choice(PATTERN_LETTERS) for _ in range(120))
        cv2.putText(page, words, (0, int((row + 1) * line_mm * pixels_per_mm)), cv2.FONT_HERSHEY_SIMPLEX, line_mm * pixels_per_mm / 40, ink, max(1, int(line_mm / 3)), cv2.LINE_AA)
    return texture_on_plane(rng, page.astype(np.float32), plane, 1 / pixels_per_mm, view)


def clutter(rng, plane, assets, view):
    u, v = plane_points(plane, view)
    surface = np.ones(u.shape + (3,), np.float32) * colour(rng)
    for _ in range(rng.randrange(150, 300)):
        centre = np.array([rng.uniform(-200, 200), rng.uniform(-250, 250)])
        angle = rng.uniform(0, math.pi)
        width, height = log_uniform(rng, 3, 60), log_uniform(rng, 3, 60)
        fill = colour(rng)
        axes = np.array([[math.cos(angle), math.sin(angle)], [-math.sin(angle), math.cos(angle)]])
        corners = centre + np.array([[-width, -height], [width, -height], [width, height], [-width, height]]) / 2 @ axes
        (left, top), (right, bottom) = np.floor(project(plane, corners).min(axis=0)) - 1, np.ceil(project(plane, corners).max(axis=0)) + 1
        rows = slice(int(np.clip(top, 0, view.height)), int(np.clip(bottom, 0, view.height)))
        columns = slice(int(np.clip(left, 0, view.width)), int(np.clip(right, 0, view.width)))
        du, dv = u[rows, columns] - centre[0], v[rows, columns] - centre[1]
        across, along = du * axes[0, 0] + dv * axes[0, 1], du * axes[1, 0] + dv * axes[1, 1]
        inside = soft_step(np.minimum(width / 2 - np.abs(across), height / 2 - np.abs(along)), 0.3)[:, :, None]
        surface[rows, columns] = surface[rows, columns] * (1 - inside) + fill * inside
    return surface


def photo_texture(rng, plane, assets, view):
    texture = rng.choice(assets.textures)
    image = read_image(assets.texture_images / f"{texture['id']}.jpg").astype(np.float32)
    return texture_on_plane(rng, image, plane, rng.uniform(0.12, 0.35), view)


def texture_on_plane(rng, image, plane, mm_per_pixel, view):
    angle = rng.uniform(0, 2 * math.pi)
    offset = np.array([rng.uniform(-100, 100), rng.uniform(-100, 100)])
    cosine, sine = math.cos(angle) * mm_per_pixel, math.sin(angle) * mm_per_pixel
    to_mm = np.array([[cosine, -sine, offset[0]], [sine, cosine, offset[1]], [0, 0, 1]])
    return warp_into_frame(image, plane @ to_mm, view, border=cv2.BORDER_REFLECT_101)


def patterned_surface(rng, plane, assets, view):
    pattern = rng.choice([stripes, checks, grid, dots, text, clutter]) if rng.random() < 0.5 else photo_texture
    surface = pattern(rng, plane, assets, view)
    return surface * rng.uniform(0.8, 1.1) + noise(rng, (view.height, view.width), rng.uniform(1, 4))[:, :, None]


def plain_scene(rng, pose, image, assets):
    surface = plain_surface(rng, pose.view)
    if image is None:
        return surface, None
    frame, corners, _ = lay_card(rng, surface, image, card_homography(rng, pose), pose.view)
    return frame, corners


def patterned_scene(rng, pose, image, assets):
    plane = card_homography(rng, pose)
    surface = patterned_surface(rng, plane, assets, pose.view)
    if image is None:
        return surface, None
    frame, corners, _ = lay_card(rng, surface, image, plane, pose.view)
    return frame, corners


def shadow_scene(rng, pose, image, assets):
    plane = card_homography(rng, pose)
    surface = plain_surface(rng, pose.view)
    angle, length = rng.uniform(0, 2 * math.pi), rng.uniform(1.5, 5)
    shadow = polygon_mask(plane, card_rectangle(offset_mm=(length * math.cos(angle), length * math.sin(angle))), pose.view, rng.uniform(0.3, 1.2))
    surface *= (1 - rng.uniform(0.35, 0.65) * shadow)[:, :, None]
    frame, corners, _ = lay_card(rng, surface, image, plane, pose.view)
    return frame, corners


def sleeve_scene(rng, pose, image, assets):
    plane = card_homography(rng, pose)
    frame, corners, coverage = lay_card(rng, plain_surface(rng, pose.view), image, plane, pose.view)
    sleeve = polygon_mask(plane, card_rectangle(margin_mm=rng.uniform(0.8, 1.6)), pose.view)
    band = np.clip(sleeve - coverage, 0, 1)
    tint = rng.choice([rng.uniform(20, 80), rng.uniform(180, 235)])
    opacity = rng.uniform(0.15, 0.5)
    frame = frame * (1 - opacity * band[:, :, None]) + tint * opacity * band[:, :, None]
    haze = rng.uniform(0.02, 0.08) * coverage
    return frame * (1 - haze[:, :, None]) + 255 * haze[:, :, None], corners


def glare_scene(rng, pose, image, assets):
    plane = card_homography(rng, pose)
    frame, corners, coverage = lay_card(rng, plain_surface(rng, pose.view), image, plane, pose.view)
    centre = project(plane, np.array([[rng.uniform(-25, 25), rng.uniform(-35, 35)]]))[0]
    angle = rng.uniform(0, math.pi)
    yy, xx = np.mgrid[0 : pose.view.height, 0 : pose.view.width].astype(np.float32)
    along = (xx + 0.5 - centre[0]) * math.cos(angle) + (yy + 0.5 - centre[1]) * math.sin(angle)
    across = -(xx + 0.5 - centre[0]) * math.sin(angle) + (yy + 0.5 - centre[1]) * math.cos(angle)
    glare = np.exp(-0.5 * (across / rng.uniform(8, 40)) ** 2 - 0.5 * (along / rng.uniform(100, 300)) ** 2)
    strength = rng.uniform(80, 200) * glare * (0.3 + 0.7 * coverage)
    return frame + strength[:, :, None], corners


def motion_blur_scene(rng, pose, image, assets):
    frame, corners = plain_scene(rng, pose, image, assets)
    return blur_along(frame, rng.uniform(6, 24), rng.uniform(0, math.pi)), corners


def blur_along(frame, length, angle):
    size = int(math.ceil(length)) | 1
    kernel = np.zeros((size, size), np.float32)
    centre = size / 2 - 0.5
    reach = np.array([math.cos(angle), math.sin(angle)]) * length / 2
    start, end = np.round((np.array([centre, centre]) - reach) * 16), np.round((np.array([centre, centre]) + reach) * 16)
    cv2.line(kernel, tuple(start.astype(int)), tuple(end.astype(int)), 1.0, 1, cv2.LINE_AA, shift=4)
    return cv2.filter2D(frame, -1, kernel / kernel.sum(), borderType=cv2.BORDER_REPLICATE)


def hand_scene(rng, pose, image, assets):
    plane = card_homography(rng, pose)
    frame, corners, _ = lay_card(rng, plain_surface(rng, pose.view), image, plane, pose.view)
    corner = np.array(card_rectangle()[rng.randrange(4)])
    inward = -corner / np.linalg.norm(corner)
    tip = corner + inward * rng.uniform(4, 12)
    pointing = math.atan2(inward[1], inward[0]) + math.radians(rng.uniform(-30, 30))
    direction = np.array([math.cos(pointing), math.sin(pointing)])
    across_direction = np.array([-direction[1], direction[0]])
    half_length, half_width = 40.0, rng.uniform(8, 11)
    middle = tip - direction * half_length
    outline = [middle + direction * half_length * math.cos(t) + across_direction * half_width * math.sin(t) for t in np.linspace(0, 2 * math.pi, 96, endpoint=False)]
    shadow_offset = across_direction * rng.uniform(2, 6)
    shadow = polygon_mask(plane, [point + shadow_offset for point in outline], pose.view, rng.uniform(4, 8))
    frame *= (1 - rng.uniform(0.15, 0.3) * shadow)[:, :, None]
    blur = rng.uniform(1, 3)
    thumb = polygon_mask(plane, outline, pose.view, blur)
    u, v = plane_points(plane, pose.view)
    across = ((u - middle[0]) * across_direction[0] + (v - middle[1]) * across_direction[1]) / half_width
    shading = (0.7 + 0.3 * np.sqrt(np.clip(1 - across**2, 0, 1))).astype(np.float32)
    shade = rng.uniform(0, len(SKIN) - 1)
    lower = int(min(shade, len(SKIN) - 2))
    skin = (np.array(SKIN[lower]) * (lower + 1 - shade) + np.array(SKIN[lower + 1]) * (shade - lower))[::-1].astype(np.float32)
    skin_layer = cv2.GaussianBlur(shading, (0, 0), blur)[:, :, None] * skin[None, None, :]
    return frame * (1 - thumb[:, :, None]) + skin_layer * thumb[:, :, None], corners


def camera(rng, frame):
    frame = cv2.GaussianBlur(frame, (0, 0), rng.uniform(0.4, 1.0))
    frame = frame + noise(rng, frame.shape, rng.uniform(1, 4))
    return np.clip(frame, 0, 255).astype(np.uint8)


CONDITIONS = [
    Condition("plain", True, plain_scene),
    Condition("patterned", True, patterned_scene),
    Condition("shadow", True, shadow_scene),
    Condition("sleeve", True, sleeve_scene),
    Condition("glare", True, glare_scene),
    Condition("motion-blur", True, motion_blur_scene),
    Condition("hand", True, hand_scene),
    Condition("empty-plain", False, plain_scene),
    Condition("empty-patterned", False, patterned_scene),
]


def card_for(cards, index):
    by_color = [card for card in cards if card["borderColor"] == BORDER_COLORS[index % len(BORDER_COLORS)]]
    return by_color[(index // len(BORDER_COLORS)) % len(by_color)]


def render(condition, index, assets):
    rng = random.Random(f"{SEED}:{condition.name}:{index}")
    bucket = TILT_BUCKETS[index // FRAMES_PER_BUCKET]
    pose = pose_in(rng, bucket)
    card = card_for(assets.cards, index) if condition.has_card else None
    image = read_image(assets.images / f"{card['id']}.jpg") if card else None
    frame, corners = condition.scene(rng, pose, image, assets)
    label = {
        "frame": f"{condition.name}-{index:03d}.png",
        "condition": condition.name,
        "scryfallId": card["id"] if card else None,
        "borderColor": card["borderColor"] if card else None,
        "corners": corners.round(4).tolist() if corners is not None else None,
        "tiltDegrees": round(pose.tilt_degrees, 4),
        "tiltBucket": bucket.name,
        "intrinsicMatrix": intrinsic_matrix(pose).round(4).tolist(),
    }
    return camera(rng, frame), label


@dataclass(frozen=True)
class HandPath:
    arrival: tuple
    drift_per_second: tuple
    shake: tuple


def hand_path(rng):
    reach, direction = rng.uniform(25, 45), rng.uniform(0, 2 * math.pi)
    speed, heading = log_uniform(rng, 1, 8), rng.uniform(0, 2 * math.pi)
    arrival = (reach * math.cos(direction), reach * math.sin(direction), rng.uniform(-6, 6))
    drift = (speed * math.cos(heading), speed * math.sin(heading), rng.uniform(-1, 1))
    shake = tuple(
        (axis, rng.uniform(0.1, 0.4) if axis < 2 else rng.uniform(0.05, 0.2), rng.uniform(3, 10), rng.uniform(0, 2 * math.pi))
        for axis in range(3)
        for _ in range(2)
    )
    return HandPath(arrival, drift, shake)


def hand_offset(hand, time_ms):
    arriving = max(0.0, 1 - time_ms / REST_MS) ** 1.5
    seconds = time_ms / 1000
    offset = [hand.arrival[axis] * arriving + hand.drift_per_second[axis] * seconds for axis in range(3)]
    for axis, amplitude, frequency, phase in hand.shake:
        offset[axis] += amplitude * math.sin(2 * math.pi * frequency * seconds + phase)
    return offset


def hand_warp(hand, time_ms, camera_matrix, distance_mm):
    x_mm, y_mm, roll_degrees = hand_offset(hand, time_ms)
    pan, lift, roll = math.atan(x_mm / distance_mm), -math.atan(y_mm / distance_mm), math.radians(roll_degrees)
    about_y = np.array([[math.cos(pan), 0, math.sin(pan)], [0, 1, 0], [-math.sin(pan), 0, math.cos(pan)]])
    about_x = np.array([[1, 0, 0], [0, math.cos(lift), -math.sin(lift)], [0, math.sin(lift), math.cos(lift)]])
    about_z = np.array([[math.cos(roll), -math.sin(roll), 0], [math.sin(roll), math.cos(roll), 0], [0, 0, 1]])
    return camera_matrix @ about_z @ about_y @ about_x @ np.linalg.inv(camera_matrix)


def render_clip(condition, index, assets):
    name = f"{condition.name}-clip-{index:03d}"
    rng = random.Random(f"{SEED}:{condition.name}:clip-{index}")
    bucket = TILT_BUCKETS[index % len(TILT_BUCKETS)]
    pose = pose_in(rng, bucket)
    card = card_for(assets.cards, index)
    image = read_image(assets.images / f"{card['id']}.jpg")
    scene_seed = rng.randrange(1 << 30)
    hand = hand_path(rng)
    photo_ms = REST_MS + ANALYSIS_INTERVAL_MS + PHOTO_AFTER_STILL_MS + rng.uniform(*PHOTO_DELAY_MS)
    _, reference = condition.scene(random.Random(scene_seed), pose, image, assets)
    width_px = (np.linalg.norm(reference[1] - reference[0]) + np.linalg.norm(reference[2] - reference[3])) / 2
    distance_mm = pose.focal_px * CARD_WIDTH_MM / width_px
    camera_matrix = intrinsic_matrix(pose)
    centre = reference.mean(axis=0, keepdims=True)

    def shot(time_ms, width, height, camera_key):
        scale = np.diag([width / FRAME_WIDTH, height / FRAME_HEIGHT, 1.0])
        view = View(scale @ hand_warp(hand, time_ms, camera_matrix, distance_mm), width, height)
        frame, corners = condition.scene(random.Random(scene_seed), replace(pose, view=view), image, assets)
        start, end = (project(scale @ hand_warp(hand, time_ms + side * EXPOSURE_MS / 2, camera_matrix, distance_mm), centre)[0] for side in (-1, 1))
        streak = end - start
        if np.hypot(*streak) >= 1:
            frame = blur_along(frame, np.hypot(*streak), math.atan2(streak[1], streak[0]))
        label = {"timeMs": round(time_ms, 4), "corners": corners.round(4).tolist(), "intrinsicMatrix": (scale @ camera_matrix).round(4).tolist()}
        return camera(random.Random(f"{SEED}:{name}:{camera_key}"), frame), label

    frames = []
    for number in range(CLIP_FRAMES):
        frame, label = shot(number * ANALYSIS_INTERVAL_MS, FRAME_WIDTH, FRAME_HEIGHT, number)
        frames.append((f"{name}-{number:02d}.png", frame, label))
    photo, photo_label = shot(photo_ms, PHOTO_WIDTH, PHOTO_HEIGHT, "photo")
    label = {
        "clip": name,
        "condition": condition.name,
        "scryfallId": card["id"],
        "borderColor": card["borderColor"],
        "tiltDegrees": round(pose.tilt_degrees, 4),
        "tiltBucket": bucket.name,
        "restMs": REST_MS,
        "frames": [{"frame": file, **frame_label} for file, _, frame_label in frames],
        "photo": {"frame": f"{name}-photo.jpg", "width": PHOTO_WIDTH, "height": PHOTO_HEIGHT, **photo_label},
    }
    return [(file, frame) for file, frame, _ in frames], photo, label


def render_to(output, assets, task):
    cv2.setNumThreads(1)
    condition, index = CONDITIONS[task[0]], task[1]
    frame, label = render(condition, index, assets)
    cv2.imwrite(str(output / label["frame"]), frame, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    return label


def render_clip_to(output, assets, task):
    cv2.setNumThreads(1)
    condition = next(candidate for candidate in CONDITIONS if candidate.name == task[0])
    frames, photo, label = render_clip(condition, task[1], assets)
    for file, frame in frames:
        cv2.imwrite(str(output / file), frame, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    cv2.imwrite(str(output / label["photo"]["frame"]), photo, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return label


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cards", required=True)
    parser.add_argument("--images", required=True)
    parser.add_argument("--textures", required=True)
    parser.add_argument("--texture-images", required=True)
    parser.add_argument("--output", required=True)
    arguments = parser.parse_args()
    cards = json.loads(Path(arguments.cards).read_text())["cards"]
    textures = json.loads(Path(arguments.textures).read_text())["textures"]
    assets = Assets(cards, Path(arguments.images), textures, Path(arguments.texture_images))
    for items, directory in [(cards, assets.images), (textures, assets.texture_images)]:
        failures = asyncio.run(download(items, directory))
        if failures:
            raise SystemExit(f"{len(failures)} images did not download, first: {failures[0]}")
    output = Path(arguments.output)
    output.mkdir(parents=True, exist_ok=True)
    tasks = [(number, index) for number in range(len(CONDITIONS)) for index in range(FRAMES_PER_BUCKET * len(TILT_BUCKETS))]
    clip_tasks = [(condition, index) for condition in CLIP_CONDITIONS for index in range(CLIPS_PER_CONDITION)]
    with ProcessPoolExecutor() as pool:
        labels = list(pool.map(partial(render_to, output, assets), tasks, chunksize=8))
        clips = list(pool.map(partial(render_clip_to, output, assets), clip_tasks))
    labels_file = {"frameWidth": FRAME_WIDTH, "frameHeight": FRAME_HEIGHT, "cardMm": [CARD_WIDTH_MM, CARD_HEIGHT_MM], "frames": labels, "clips": clips}
    (output / "labels.json").write_text(json.dumps(labels_file, indent=1) + "\n")
    print(json.dumps({"frames": len(labels), "clips": len(clips)}))


if __name__ == "__main__":
    main()
