#!/usr/bin/env python3
"""Build a labelled QA contact sheet from the generated loadout silhouettes."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "ui" / "loadout-silhouettes"
OUTPUT = ROOT / "output" / "imagegen" / "loadout-silhouettes" / "contact-sheet.png"
IDS = (
    "rifle", "smg", "shotgun", "sniper",
    "machine_pistol", "desert_eagle", "frag", "incendiary",
    "molotov",
    "combat_knife", "laser_blade", "uav", "strike",
    "juggernaut", "sentry", "cas", "firebomb",
    "attack_helicopter", "minigun",
)


def main() -> None:
    columns = 4
    cell_width, cell_height = 512, 300
    rows = math.ceil(len(IDS) / columns)
    sheet = Image.new(
        "RGBA",
        (columns * cell_width, rows * cell_height),
        (7, 16, 22, 255),
    )
    draw = ImageDraw.Draw(sheet)

    for index, asset_id in enumerate(IDS):
        column, row = index % columns, index // columns
        left, top = column * cell_width, row * cell_height
        image = Image.open(ASSET_DIR / f"{asset_id}.png").convert("RGBA")
        image.thumbnail((480, 240), Image.Resampling.LANCZOS)
        sheet.alpha_composite(
            image,
            (
                left + (cell_width - image.width) // 2,
                top + 24 + (240 - image.height) // 2,
            ),
        )
        draw.rectangle(
            (left, top, left + cell_width - 1, top + cell_height - 1),
            outline=(52, 76, 86, 255),
            width=1,
        )
        draw.text((left + 16, top + 270), asset_id.upper(), fill=(133, 160, 171, 255))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUTPUT)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
