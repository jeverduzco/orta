"""Generates Orta's brand SVGs from one geometry.

Run from the repo root:  python3 -I brand/generate.py brand
The extension icons (public/icons/icon-*.png) are rasterised from the
icon-*.svg outputs; see brand/README.md.
"""
import math
import pathlib
import sys

OUT = pathlib.Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

VIOLET = "#6C3CE9"   # Orta Violet — tile
RIVET = "#4B21B8"    # Violet 800 — rivet dot / depth
SPARK = "#FFC24B"    # Spark — the AI tool
INK = "#17131F"
WHITE = "#FFFFFF"


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def spark_path(cx, cy, r, waist=0.5):
    """Four-point spark with concave sides (quadratic curves toward the centre)."""
    tips = [(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)]
    d = f"M{f(tips[0][0])} {f(tips[0][1])}"
    for i in range(4):
        a, b = tips[i], tips[(i + 1) % 4]
        qx = cx + ((a[0] + b[0]) / 2 - cx) * (1 - waist) * 0.62
        qy = cy + ((a[1] + b[1]) / 2 - cy) * (1 - waist) * 0.62
        d += f" Q{f(qx)} {f(qy)} {f(b[0])} {f(b[1])}"
    return d + "Z"


def polar(px, py, deg, length):
    a = math.radians(deg)
    return px + length * math.cos(a), py - length * math.sin(a)


# ---- Glyph on a 128 grid -------------------------------------------------
# An opened multitool seen from the side: four tools fan out of one rivet,
# and the spark — the AI — rises from the gap in the middle.
P = (64, 100)                                     # rivet
BLADE_W = 12
BLADES = [(150, 44), (115, 48), (65, 48), (30, 44)]
SMALL_BLADES = [(148, 48), (32, 48)]              # 16–32 px: two tools read better
SPARK_L, SPARK_R = 62, 20


def glyph(blade_color, rivet_color, spark_color, *, small=False):
    w = 17 if small else BLADE_W
    blades = SMALL_BLADES if small else BLADES
    lines = "".join(
        f'<path d="M{P[0]} {P[1]}L{f(polar(*P, a, l)[0])} {f(polar(*P, a, l)[1])}"/>' for a, l in blades
    )
    parts = [f'<g stroke="{blade_color}" stroke-width="{w}" stroke-linecap="round" fill="none">{lines}</g>']
    pr = 15 if small else 12
    parts.append(f'<circle cx="{P[0]}" cy="{P[1]}" r="{pr}" fill="{blade_color}"/>')
    if rivet_color:
        parts.append(f'<circle cx="{P[0]}" cy="{P[1]}" r="{5.5 if small else 4.5}" fill="{rivet_color}"/>')
    sl, sr = (58, 27) if small else (SPARK_L, SPARK_R)
    sc = polar(*P, 90, sl)
    parts.append(f'<path d="{spark_path(sc[0], sc[1], sr)}" fill="{spark_color}"/>')
    return "".join(parts)


def tile_svg(size, *, inset=0, small=False, radius=30):
    """App icon: violet tile + white tools + spark. `inset` = transparent padding in 128 units."""
    s = 128 - 2 * inset
    k = s / 128
    body = (
        f'<rect x="{inset}" y="{inset}" width="{s}" height="{s}" rx="{f(radius * k)}" fill="{VIOLET}"/>'
        f'<g transform="translate({inset} {inset}) scale({f(k)})">{glyph(WHITE, RIVET, SPARK, small=small)}</g>'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 128 128">'
        f"<title>Orta</title>{body}</svg>"
    )


def glyph_svg(blade, rivet, spark, name):
    # Trim to the glyph's own bounds (+ a little air).
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="104" height="104" viewBox="12 12 104 104">'
        f"<title>{name}</title>{glyph(blade, rivet, spark)}</svg>"
    )


# ---- Wordmark ------------------------------------------------------------
# Monoline geometric lowercase; x-height 48, stroke 11. The r's shoulder runs
# straight into the t's crossbar: one stroke, like two tools on one hinge.
WM_W = 11


def wordmark_paths():
    r = 18.5
    o = f'<circle cx="24" cy="40" r="{r}"/>'
    r_stem = '<path d="M63.5 58.5V40"/>'
    rt = f'<path d="M63.5 40A{r} {r} 0 0 1 82 21.5H118"/>'
    t_stem = '<path d="M104 6V46A12.5 12.5 0 0 0 116.5 58.5"/>'
    a_bowl = f'<circle cx="152" cy="40" r="{r}"/>'
    a_stem = '<path d="M170.5 21.5V58.5"/>'
    return o + r_stem + rt + t_stem + a_bowl + a_stem


def wordmark_svg(color, name="Orta"):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="182" height="66" viewBox="-0.5 0 182 66">'
        f"<title>{name}</title>"
        f'<g fill="none" stroke="{color}" stroke-width="{WM_W}" stroke-linecap="round" stroke-linejoin="round">'
        f"{wordmark_paths()}</g></svg>"
    )


def lockup_svg(word_color, name="Orta"):
    # Tile 96 tall; wordmark x-height aligned to the tile's optical centre.
    scale = 0.75
    tile = (
        f'<rect width="96" height="96" rx="22.5" fill="{VIOLET}"/>'
        f'<g transform="scale(0.75)">{glyph(WHITE, RIVET, SPARK)}</g>'
    )
    word = (
        f'<g transform="translate(124 18) scale(0.92)" fill="none" stroke="{word_color}" '
        f'stroke-width="{WM_W}" stroke-linecap="round" stroke-linejoin="round">{wordmark_paths()}</g>'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="296" height="96" viewBox="0 0 296 96">'
        f"<title>{name}</title>{tile}{word}</svg>"
    )


files = {
    "orta-icon.svg": tile_svg(512),
    "orta-icon-small.svg": tile_svg(512, small=True),
    "orta-glyph-violet.svg": glyph_svg(VIOLET, None, VIOLET, "Orta glyph (violet)"),
    "orta-glyph-on-dark.svg": glyph_svg(WHITE, None, SPARK, "Orta glyph (on dark)"),
    "orta-glyph-ink.svg": glyph_svg(INK, None, INK, "Orta glyph (ink)"),
    "orta-glyph-white.svg": glyph_svg(WHITE, None, WHITE, "Orta glyph (white)"),
    "orta-wordmark-ink.svg": wordmark_svg(INK),
    "orta-wordmark-white.svg": wordmark_svg(WHITE),
    "orta-lockup-ink.svg": lockup_svg(INK),
    "orta-lockup-white.svg": lockup_svg(WHITE),
    # Chrome extension icon sources: store icon keeps 16px transparent padding.
    "icon-16.svg": tile_svg(16, small=True, radius=26),
    "icon-32.svg": tile_svg(32, radius=28),
    "icon-48.svg": tile_svg(48, inset=2),
    "icon-128.svg": tile_svg(128, inset=16),
}
for name, svg in files.items():
    target = OUT / "extension-icons" / name if name.startswith("icon-") else OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(svg + "\n")
print("\n".join(files))
