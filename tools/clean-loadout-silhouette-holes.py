#!/usr/bin/env python3
"""Remove non-physical generated detail holes from selected flat silhouettes."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets" / "ui" / "loadout-silhouettes"
FILL = (0xDC, 0xE7, 0xEA, 255)

# These regions are solid real-world parts. The generator occasionally rendered
# engraved lines or a cylinder panel as transparent holes, which breaks the
# intended pure-silhouette treatment.
SOLID_REGIONS = {
    "desert_eagle": ((565, 92, 737, 223),),
    "combat_knife": ((553, 250, 913, 263),),
    "laser_blade": ((553, 250, 913, 263),),
}


def main() -> None:
    for asset_id, regions in SOLID_REGIONS.items():
        path = ASSET_DIR / f"{asset_id}.png"
        image = Image.open(path).convert("RGBA")
        draw = ImageDraw.Draw(image)
        for region in regions:
            draw.rectangle(region, fill=FILL)
        image.save(path)
        print(f"Cleaned {path}")


if __name__ == "__main__":
    main()
