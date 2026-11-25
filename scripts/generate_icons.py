from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "public" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

SCALE = 4
BASE = 512 * SCALE


def hex_to_rgb(value: str):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def make_icon(size: int, rounded: bool, padding: int = 0) -> Image.Image:
    canvas = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    radius = int(BASE * 0.22) if rounded else 0
    top = hex_to_rgb("#0F172A")
    bottom = hex_to_rgb("#1E293B")
    mask = Image.new("L", (BASE, BASE), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        (0, 0, BASE - 1, BASE - 1), radius=radius, fill=255
    )
    gradient = Image.new("RGBA", (BASE, BASE))
    gradient_draw = ImageDraw.Draw(gradient)
    for y in range(BASE):
        ratio = y / BASE
        color = tuple(
            int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3)
        ) + (255,)
        gradient_draw.line((0, y, BASE, y), fill=color)
    canvas.paste(gradient, (0, 0), mask)
    draw = ImageDraw.Draw(canvas)

    # Faint industrial grid
    grid_color = (148, 163, 184, 22)
    step = int(BASE / 13)
    for pos in range(step, BASE, step):
        draw.line((pos, 0, pos, BASE), fill=grid_color, width=max(1, SCALE))
        draw.line((0, pos, BASE, pos), fill=grid_color, width=max(1, SCALE))

    # Subtle emerald glow orb
    glow = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (int(BASE * 0.66), int(-BASE * 0.12), int(BASE * 1.08), int(BASE * 0.3)),
        fill=(16, 185, 129, 38),
    )
    canvas.alpha_composite(glow)

    center = BASE / 2 + padding * SCALE / 2
    outer_r = BASE * 0.285 - padding * SCALE / 2
    inner_r = BASE * 0.155 - padding * SCALE / 4
    white = (248, 250, 252, 242)
    draw.ellipse(
        (center - outer_r, center - outer_r, center + outer_r, center + outer_r),
        outline=white,
        width=int(BASE * 0.038),
    )
    draw.ellipse(
        (
            center - inner_r,
            center - inner_r,
            center + inner_r,
            center + inner_r,
        ),
        outline=(248, 250, 252, 100),
        width=int(BASE * 0.018),
    )

    emerald = (52, 211, 153, 255)
    start = (BASE * 0.17, BASE * 0.83)
    end = (BASE * 0.83, BASE * 0.17)
    draw.line(
        (start[0], start[1], end[0], end[1]),
        fill=emerald,
        width=int(BASE * 0.042),
    )
    # Rounded line caps
    cap_r = BASE * 0.021
    for point in (start, end):
        draw.ellipse(
            (point[0] - cap_r, point[1] - cap_r, point[0] + cap_r, point[1] + cap_r),
            fill=emerald,
        )
    # Small terminus square for an engineering feel
    square = BASE * 0.031
    sx, sy = BASE * 0.81, BASE * 0.15
    draw.rounded_rectangle(
        (sx - square, sy - square, sx + square, sy + square),
        radius=int(BASE * 0.011),
        fill=emerald,
    )

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


make_icon(192, rounded=True).save(ICON_DIR / "icon-192.png", optimize=True)
make_icon(512, rounded=True).save(ICON_DIR / "icon-512.png", optimize=True)
make_icon(512, rounded=False).save(
    ICON_DIR / "icon-maskable-512.png", optimize=True
)
make_icon(180, rounded=False).save(
    ICON_DIR / "apple-touch-icon.png", optimize=True
)
make_icon(64, rounded=True).save(ROOT / "app" / "icon.png", optimize=True)
make_icon(32, rounded=True).save(ICON_DIR / "favicon-32.png", optimize=True)

print("icons generated")
