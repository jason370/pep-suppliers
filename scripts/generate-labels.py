#!/usr/bin/env python3
"""
RC-029b — Pep Suppliers vial label PNG generator.
Generates transparent vial mockups with brand-correct front labels.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT_DIR = ROOT / "images" / "vials"
MASTER = ROOT / "site-repo" / "images" / "01_master_mockup.png"
VIAL_BASE = ASSETS / "vial-base.png"
LOGO_WORDMARK = ASSETS / "logo-wordmark.png"
FONTS = ASSETS / "fonts"

NAVY = (13, 27, 42)
TEAL = (14, 165, 165)
WHITE = (255, 255, 255)
GREY_HEX = (210, 218, 228)

LABEL_W, LABEL_H = 450, 525
OUTPUT_W, OUTPUT_H = 400, 900
BATCH_SIZE = 20

# Label placement on extracted vial-base.png (340×520)
LABEL_ON_VIAL = (88, 148, 162, 230)

LOT_TEXT = "LOT: 123456 | BATCH: PS-0625"
DISCLAIMER = "RESEARCH USE ONLY / NOT FOR HUMAN CONSUMPTION"

SAMPLES = [
    ("Tirzepatide", "10 MG", "Tirzepatide-10mg"),
    ("BPC-157", "5 MG", "BPC157-5mg"),
    ("Semaglutide", "2 MG", "Semaglutide-2mg"),
]


def progress_path() -> Path:
    tmp = Path(os.environ.get("TEMP", "/tmp"))
    return tmp / "label_progress.json"


def load_font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = FONTS / name
    if path.exists():
        return ImageFont.truetype(str(path), size=size)
    fallback = Path(r"C:\Windows\Fonts\arialbd.ttf")
    if fallback.exists():
        return ImageFont.truetype(str(fallback), size=size)
    return ImageFont.load_default()


def load_products() -> list[dict]:
    raw = subprocess.check_output(["git", "show", "HEAD:products.json"], cwd=ROOT)
    return json.loads(raw)


def slug_size(size: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "", size.lower())
    return s or "default"


def format_mg(size: str) -> str:
    m = re.search(r"([\d.]+)\s*(mg|mcg|iu|ml|g)?", size, re.I)
    if not m:
        return size.upper()
    num, unit = m.group(1), (m.group(2) or "mg").upper()
    if unit == "MG":
        unit = "MG"
    return f"{num} {unit}"


def draw_honeycomb(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    r = 14
    dx = r * 1.5
    dy = r * math.sqrt(3)
    for row in range(-1, int(h / dy) + 2):
        for col in range(-1, int(w / dx) + 2):
            cx = col * dx + (dx / 2 if row % 2 else 0)
            cy = row * dy
            pts = []
            for i in range(6):
                ang = math.radians(60 * i - 30)
                pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
            draw.polygon(pts, outline=GREY_HEX, width=1)


def fit_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font_name: str,
    max_w: int,
    start_size: int,
    min_size: int = 14,
) -> tuple[ImageFont.FreeTypeFont | ImageFont.ImageFont, str]:
    upper = text.upper()
    for size in range(start_size, min_size - 1, -1):
        font = load_font(font_name, size)
        bbox = draw.textbbox((0, 0), upper, font=font)
        if bbox[2] - bbox[0] <= max_w:
            return font, upper
    font = load_font(font_name, min_size)
    return font, upper


def build_front_label(peptide_name: str, mg_text: str) -> Image.Image:
    label = Image.new("RGBA", (LABEL_W, LABEL_H), WHITE + (255,))
    draw = ImageDraw.Draw(label)

    draw_honeycomb(draw, LABEL_W, LABEL_H)

    if LOGO_WORDMARK.exists():
        logo = Image.open(LOGO_WORDMARK).convert("RGBA")
        lw = min(175, LABEL_W - 50)
        lh = int(logo.height * (lw / logo.width))
        logo = logo.resize((lw, lh), Image.Resampling.LANCZOS)
        label.paste(logo, ((LABEL_W - lw) // 2, 12), logo)

    draw.line((LABEL_W // 2 - 28, 92, LABEL_W // 2 + 28, 92), fill=TEAL, width=2)

    name_font, name_text = fit_text(draw, peptide_name, "Montserrat-Bold.ttf", LABEL_W - 36, 32, 11)
    nb = draw.textbbox((0, 0), name_text, font=name_font)
    draw.text(((LABEL_W - (nb[2] - nb[0])) // 2, 108), name_text, fill=NAVY, font=name_font)

    badge_font = load_font("Montserrat-Bold.ttf", 20)
    mg = mg_text.upper()
    bb = draw.textbbox((0, 0), mg, font=badge_font)
    bw = (bb[2] - bb[0]) + 32
    bh = (bb[3] - bb[1]) + 14
    bx = (LABEL_W - bw) // 2
    by = 152
    draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=6, fill=TEAL)
    draw.text((bx + 18, by + 6), mg, fill=WHITE, font=badge_font)

    disc_font = load_font("OpenSans-SemiBold.ttf", 11)
    db = draw.textbbox((0, 0), DISCLAIMER, font=disc_font)
    draw.text(((LABEL_W - (db[2] - db[0])) // 2, by + bh + 14), DISCLAIMER, fill=NAVY, font=disc_font)

    strip_h = 42
    draw.rectangle((0, LABEL_H - strip_h, LABEL_W, LABEL_H), fill=NAVY)
    lot_font = load_font("OpenSans-Regular.ttf", 12)
    lb = draw.textbbox((0, 0), LOT_TEXT, font=lot_font)
    draw.text(((LABEL_W - (lb[2] - lb[0])) // 2, LABEL_H - strip_h + 12), LOT_TEXT, fill=TEAL, font=lot_font)

    return label


def color_dist(c1: tuple[int, ...], c2: tuple[int, ...]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1[:3], c2[:3])))


def remove_navy_bg(img: Image.Image, tol: float = 48) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if color_dist((r, g, b), NAVY) <= tol or (r + g + b) < 55:
                px[x, y] = (r, g, b, 0)
    return img


def composite_vial(peptide_name: str, mg_text: str) -> Image.Image:
    if not VIAL_BASE.exists():
        raise FileNotFoundError(f"Missing vial base asset: {VIAL_BASE}")

    base = Image.open(VIAL_BASE).convert("RGBA")
    label = build_front_label(peptide_name, mg_text)
    lx, ly, lw, lh = LABEL_ON_VIAL
    label = label.resize((lw, lh), Image.Resampling.LANCZOS)
    # Fully cover reference label art before compositing generated label.
    cover = Image.new("RGBA", (lw, lh), WHITE + (255,))
    base.paste(cover, (lx, ly))
    base.paste(label, (lx, ly), label)
    base = remove_navy_bg(base)

    scale = min(OUTPUT_W / base.width, OUTPUT_H / base.height)
    nw = max(1, int(base.width * scale))
    nh = max(1, int(base.height * scale))
    base = base.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (OUTPUT_W, OUTPUT_H), (0, 0, 0, 0))
    ox = (OUTPUT_W - nw) // 2
    oy = OUTPUT_H - nh - 20
    canvas.paste(base, (ox, oy), base)
    return canvas


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")


def load_progress() -> dict:
    p = progress_path()
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"completed": []}


def save_progress(data: dict) -> None:
    progress_path().write_text(json.dumps(data, indent=2), encoding="utf-8")


def iter_jobs(products: list[dict]) -> list[tuple[str, str, str, str]]:
    jobs: list[tuple[str, str, str, str]] = []
    for p in products:
        if p.get("visible") is False:
            continue
        pid = p["id"]
        name = p.get("name") or pid
        sizes = p.get("vialSizes") or ["10MG"]
        for size in sizes:
            slug = slug_size(size)
            mg = format_mg(size)
            out_name = f"{pid}-{slug}.png"
            jobs.append((pid, name, mg, out_name))
    return jobs


def generate_samples() -> None:
    for name, mg, fname in SAMPLES:
        img = composite_vial(name, mg)
        save_png(img, OUT_DIR / f"{fname}.png")
        print(f"sample -> {OUT_DIR / fname}.png")


def generate_catalog(batch_size: int = BATCH_SIZE) -> None:
    products = load_products()
    jobs = iter_jobs(products)
    progress = load_progress()
    done = set(progress.get("completed", []))

    pending = [j for j in jobs if j[3] not in done]
    print(f"Catalog jobs: {len(jobs)} total, {len(pending)} pending")

    for i in range(0, len(pending), batch_size):
        batch = pending[i : i + batch_size]
        for _pid, name, mg, out_name in batch:
            img = composite_vial(name, mg)
            save_png(img, OUT_DIR / out_name)
            done.add(out_name)
            print(f"  {out_name} ({name} / {mg})")
        progress["completed"] = sorted(done)
        save_progress(progress)

    print(f"Done. {len(done)} PNGs in {OUT_DIR}")


def main() -> int:
    parser = argparse.ArgumentParser(description="RC-029b Pep Suppliers vial label generator")
    parser.add_argument("--samples", action="store_true", help="Generate 3 evidence sample PNGs only")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = parser.parse_args()

    if not MASTER.exists():
        print(f"WARNING: {MASTER} not found; using extracted assets only", file=sys.stderr)

    if args.samples:
        generate_samples()
        return 0

    generate_samples()
    generate_catalog(batch_size=args.batch_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
