#!/usr/bin/env python3
"""Validate the generated loadout silhouettes used by the browser UI."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "ui" / "loadout-silhouettes"
EXPECTED_COLOR = (0xDC, 0xE7, 0xEA)
EXPECTED_SIZE = (1024, 512)
REQUIRED_IDS = (
    "rifle",
    "smg",
    "shotgun",
    "sniper",
    "machine_pistol",
    "frag",
    "incendiary",
    "molotov",
    "combat_knife",
    "laser_blade",
    "uav",
    "strike",
    "juggernaut",
    "sentry",
    "cas",
    "firebomb",
    "attack_helicopter",
    "minigun",
)
VECTOR_IDS = (
    "desert_eagle",
    "railgun",
)


def validate(asset_id: str) -> None:
    path = ASSET_DIR / f"{asset_id}.png"
    if not path.is_file():
        raise SystemExit(f"missing silhouette: {path}")

    image = Image.open(path).convert("RGBA")
    if image.size != EXPECTED_SIZE:
        raise SystemExit(f"{asset_id}: expected {EXPECTED_SIZE}, got {image.size}")

    alpha = image.getchannel("A")
    if alpha.getbbox() is None:
        raise SystemExit(f"{asset_id}: silhouette is fully transparent")
    if any(alpha.getpixel(point) != 0 for point in (
        (0, 0),
        (image.width - 1, 0),
        (0, image.height - 1),
        (image.width - 1, image.height - 1),
    )):
        raise SystemExit(f"{asset_id}: one or more canvas corners are visible")

    pixels = image.get_flattened_data()
    colors = {pixel[:3] for pixel in pixels if pixel[3] > 0}
    if colors != {EXPECTED_COLOR}:
        raise SystemExit(f"{asset_id}: unexpected visible RGB values: {colors}")


def validate_vector(asset_id: str) -> None:
    path = ASSET_DIR / f"{asset_id}.svg"
    if not path.is_file():
        raise SystemExit(f"missing vector silhouette: {path}")
    source = path.read_text(encoding="utf-8")
    required = ('<svg', 'viewBox="0 0 1024 512"', '#dce7ea')
    if any(token not in source for token in required):
        raise SystemExit(f"{asset_id}: invalid shared vector silhouette")


def main() -> None:
    for asset_id in REQUIRED_IDS:
        validate(asset_id)
    for asset_id in VECTOR_IDS:
        validate_vector(asset_id)
    print(
        f"Validated {len(REQUIRED_IDS) + len(VECTOR_IDS)} "
        "flat loadout silhouettes"
    )


if __name__ == "__main__":
    main()
