#!/usr/bin/env python3
"""Normalize generated cutouts into one consistent flat loadout silhouette."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=512)
    parser.add_argument("--coverage", type=float, default=0.84)
    parser.add_argument("--color", default="DCE7EA")
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    alpha = source.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit("input contains no visible silhouette")

    cropped_alpha = alpha.crop(bbox)
    max_width = max(1, round(args.width * args.coverage))
    max_height = max(1, round(args.height * args.coverage))
    scale = min(max_width / cropped_alpha.width, max_height / cropped_alpha.height)
    resized = cropped_alpha.resize(
        (
            max(1, round(cropped_alpha.width * scale)),
            max(1, round(cropped_alpha.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )

    color = args.color.removeprefix("#")
    if len(color) != 6:
        raise SystemExit("--color must be a six-digit RGB hex value")
    rgb = tuple(int(color[index:index + 2], 16) for index in (0, 2, 4))

    canvas = Image.new("RGBA", (args.width, args.height), (0, 0, 0, 0))
    flat = Image.new("RGBA", resized.size, (*rgb, 255))
    flat.putalpha(resized)
    canvas.alpha_composite(
        flat,
        (
            (args.width - resized.width) // 2,
            (args.height - resized.height) // 2,
        ),
    )

    destination = Path(args.out)
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination)
    print(
        f"Wrote {destination} "
        f"({resized.width}x{resized.height} subject on {args.width}x{args.height})"
    )


if __name__ == "__main__":
    main()
