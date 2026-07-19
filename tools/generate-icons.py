#!/usr/bin/env python3
"""Generate MapReach placeholder icons (icon16/48/128.png).

Dev-only helper — NOT loaded by the extension. Draws a deep-indigo rounded
square with a white map pin and a small amber outreach arrow, rendered at high
resolution and downscaled for crisp edges.

Usage:  python3 tools/generate-icons.py
Requires Pillow:  pip install pillow
"""
from PIL import Image, ImageDraw

BRAND = (79, 70, 229, 255)      # indigo-600
BRAND_DARK = (67, 56, 202, 255)  # indigo-700
WHITE = (255, 255, 255, 255)
AMBER = (245, 158, 11, 255)      # amber accent for "reach"

SUPER = 1024  # supersampled working canvas


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Rounded-square background.
    radius = int(size * 0.22)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BRAND)

    # Map pin (white teardrop = circle + triangle).
    cx = size * 0.44
    cy = size * 0.40
    r = size * 0.20
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    tip = (cx, size * 0.80)
    d.polygon([(cx - r * 0.86, cy + r * 0.5), (cx + r * 0.86, cy + r * 0.5), tip], fill=WHITE)

    # Pin hole.
    hr = r * 0.46
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=BRAND_DARK)

    # Outreach arrow (up-right) to the pin's upper right.
    ax, ay = size * 0.66, size * 0.40
    lw = max(2, int(size * 0.05))
    d.line([(ax, ay), (ax + size * 0.16, ay - size * 0.16)], fill=AMBER, width=lw)
    head = size * 0.09
    hx, hy = ax + size * 0.16, ay - size * 0.16
    d.polygon(
        [(hx + head * 0.15, hy - head * 0.15),
         (hx - head, hy),
         (hx, hy + head)],
        fill=AMBER,
    )
    return img


def main() -> None:
    base = draw_icon(SUPER)
    for target in (16, 48, 128):
        out = base.resize((target, target), Image.LANCZOS)
        out.save(f"icons/icon{target}.png")
        print(f"wrote icons/icon{target}.png")


if __name__ == "__main__":
    main()
