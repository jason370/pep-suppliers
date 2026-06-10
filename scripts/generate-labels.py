#!/usr/bin/env python3
"""
RC-029b — Pep Suppliers vial label PNG generator (authoritative spec).
Generates transparent 400x900 vial mockups with brand-correct front labels.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
OUT_DIR = ROOT / "images" / "vials"
VIAL_BASE = ASSETS / "vial-base.png"
FONTS = ASSETS / "fonts"

NAVY = (13, 27, 42)          # #0D1B2A
TEAL = (14, 165, 165)        # #0EA5A5
WHITE = (255, 255, 255)      # #FFFFFF
LIGHT_GRAY = (245, 247, 250)  # #F5F7FA
HONEY = (13, 27, 42, 13)     # navy @ ~5% alpha

# 1.25" x 1.50" @ 300dpi
LABEL_W, LABEL_H = 375, 450
OUTPUT_W, OUTPUT_H = 400, 900
BATCH_SIZE = 20

LABEL_ON_VIAL = (92, 152, 150, 210)
LOT = "123456"
BATCH = "PS-0625"
DISCLAIMER = "RESEARCH USE ONLY / NOT FOR HUMAN CONSUMPTION"

SAMPLES = [
    ("Tirzepatide", "10 MG", "tirzepatide-10mg.png"),
    ("BPC-157", "5 MG", "bpc157-5mg.png"),
    ("Semaglutide", "2 MG", "semaglutide-2mg.png"),
]


def progress_path() -> Path:
    base = Path("/tmp")
    if os.name == "nt":
        base = Path(os.environ.get("TEMP", "C:/tmp"))
        base.mkdir(parents=True, exist_ok=True)
    return base / "label_gen_progress.json"


def load_font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        FONTS / name,
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path(r"C:\Windows\Fonts\DejaVuSans-Bold.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
    ):
        if candidate.exists():
            try:
                return ImageFont.truetype(str(candidate), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def load_products() -> list[dict]:
    raw = subprocess.check_output(["git", "show", "HEAD:products.json"], cwd=ROOT)
    return json.loads(raw)


def size_slug(size: str) -> str:
    nums = re.findall(r"[\d.]+", str(size))
    if nums:
        n = nums[0]
        return n.rstrip("0").rstrip(".") if "." in n else n
    return re.sub(r"[^a-z0-9]+", "", str(size).lower()) or "10"


def format_mg(size: str, price: str | None = None) -> str:
    src = size or price or "10"
    nums = re.findall(r"[\d.]+", str(src))
    if not nums:
        return str(src).upper()
    num = nums[0]
    unit_m = re.search(r"(mg|mcg|iu|ml|g)\b", str(size), re.I)
    unit = (unit_m.group(1) if unit_m else "mg").upper()
    return f"{num} {unit}"


def draw_honeycomb_overlay(img: Image.Image) -> None:
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    r = 12
    dx = r * 1.5
    dy = r * math.sqrt(3)
    w, h = img.size
    for row in range(-1, int(h / dy) + 2):
        for col in range(-1, int(w / dx) + 2):
            cx = col * dx + (dx / 2 if row % 2 else 0)
            cy = row * dy
            pts = []
            for i in range(6):
                ang = math.radians(60 * i - 30)
                pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
            draw.polygon(pts, outline=HONEY)
    img.alpha_composite(layer)


def draw_ps_logo(draw: ImageDraw.ImageDraw, cx: int, cy: int, radius: int) -> None:
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=TEAL, width=2)
    hex_r = radius - 8
    pts = []
    for i in range(6):
        ang = math.radians(60 * i - 90)
        pts.append((cx + hex_r * math.cos(ang), cy + hex_r * math.sin(ang)))
    draw.polygon(pts, outline=NAVY, width=1)
    font = load_font("Montserrat-Bold.ttf", 16)
    tb = draw.textbbox((0, 0), "PS", font=font)
    draw.text((cx - (tb[2] - tb[0]) // 2, cy - (tb[3] - tb[1]) // 2 - 2), "PS", fill=NAVY, font=font)


def fit_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font_name: str,
    max_w: int,
    start_size: int,
    min_size: int = 11,
) -> tuple[ImageFont.FreeTypeFont | ImageFont.ImageFont, str]:
    upper = text.upper()
    for size in range(start_size, min_size - 1, -1):
        font = load_font(font_name, size)
        bbox = draw.textbbox((0, 0), upper, font=font)
        if bbox[2] - bbox[0] <= max_w:
            return font, upper
    return load_font(font_name, min_size), upper


def build_front_label(peptide_name: str, mg_text: str) -> Image.Image:
    label = Image.new("RGBA", (LABEL_W, LABEL_H), LIGHT_GRAY + (255,))
    draw = ImageDraw.Draw(label)
    draw_honeycomb_overlay(label)
    draw.rectangle((0, 0, LABEL_W - 1, LABEL_H - 1), outline=NAVY, width=2)

    draw_ps_logo(draw, LABEL_W // 2, 52, 28)

    brand_font = load_font("Montserrat-SemiBold.ttf", 11)
    brand = "PEP SUPPLIERS"
    bb = draw.textbbox((0, 0), brand, font=brand_font)
    draw.text(((LABEL_W - (bb[2] - bb[0])) // 2, 86), brand, fill=NAVY, font=brand_font)
    draw.line((LABEL_W // 2 - 26, 104, LABEL_W // 2 + 26, 104), fill=TEAL, width=2)

    name_font, name_text = fit_text(draw, peptide_name, "Montserrat-Bold.ttf", LABEL_W - 30, 28, 10)
    nb = draw.textbbox((0, 0), name_text, font=name_font)
    draw.text(((LABEL_W - (nb[2] - nb[0])) // 2, 118), name_text, fill=NAVY, font=name_font)

    badge_font = load_font("Montserrat-Bold.ttf", 18)
    mg = mg_text.upper()
    mb = draw.textbbox((0, 0), mg, font=badge_font)
    bw = (mb[2] - mb[0]) + 28
    bh = (mb[3] - mb[1]) + 12
    bx = (LABEL_W - bw) // 2
    by = 158
    draw.rounded_rectangle((bx, by, bx + bw, by + bh), radius=5, fill=TEAL)
    draw.text((bx + 14, by + 4), mg, fill=WHITE, font=badge_font)

    disc_font = load_font("OpenSans-Regular.ttf", 9)
    db = draw.textbbox((0, 0), DISCLAIMER, font=disc_font)
    draw.text(((LABEL_W - (db[2] - db[0])) // 2, by + bh + 10), DISCLAIMER, fill=NAVY, font=disc_font)

    strip_h = 36
    draw.rectangle((0, LABEL_H - strip_h, LABEL_W, LABEL_H), fill=NAVY)
    lot_text = f"LOT: {LOT}  |  BATCH: {BATCH}"
    lot_font = load_font("OpenSans-Regular.ttf", 10)
    lb = draw.textbbox((0, 0), lot_text, font=lot_font)
    draw.text(((LABEL_W - (lb[2] - lb[0])) // 2, LABEL_H - strip_h + 10), lot_text, fill=WHITE, font=lot_font)
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
    cover = Image.new("RGBA", (lw, lh), LIGHT_GRAY + (255,))
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


def iter_jobs(products: list[dict]) -> list[tuple[str, str, str, str]]:
    jobs: list[tuple[str, str, str, str]] = []
    for p in products:
        if p.get("visible") is False:
            continue
        pid = p["id"]
        name = p.get("name") or pid
        price = p.get("price", "")
        sizes = p.get("vialSizes") or ["10MG"]
        for size in sizes:
            slug = size_slug(size)
            mg = format_mg(size, price)
            out_name = f"{pid}-{slug}mg.png"
            jobs.append((pid, name, mg, out_name))
    return jobs


def load_progress() -> dict:
    p = progress_path()
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"completed": []}


def save_progress(data: dict) -> None:
    progress_path().write_text(json.dumps(data, indent=2), encoding="utf-8")


def run_jobs(jobs: list[tuple[str, str, str, str]], batch_size: int) -> None:
    progress = load_progress()
    done = set(progress.get("completed", []))
    pending = [j for j in jobs if j[3] not in done]
    print(f"Jobs: {len(jobs)} total, {len(pending)} pending")
    for i in range(0, len(pending), batch_size):
        batch = pending[i : i + batch_size]
        for _pid, name, mg, out_name in batch:
            img = composite_vial(name, mg)
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            img.save(OUT_DIR / out_name, "PNG")
            done.add(out_name)
            print(f"  {out_name} ({name} / {mg})")
        progress["completed"] = sorted(done)
        save_progress(progress)
    print(f"Done. {len(done)} PNGs in {OUT_DIR}")


def generate_samples() -> None:
    for name, mg, fname in SAMPLES:
        img = composite_vial(name, mg)
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        img.save(OUT_DIR / fname, "PNG")
        print(f"sample -> {OUT_DIR / fname}")


def main() -> int:
    parser = argparse.ArgumentParser(description="RC-029b Pep Suppliers vial label generator")
    parser.add_argument("--samples", action="store_true", help="Generate 3 evidence sample PNGs only")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--start", type=int, default=0, help="Start job index (inclusive)")
    parser.add_argument("--end", type=int, default=-1, help="End job index (exclusive)")
    args = parser.parse_args()

    if args.samples:
        generate_samples()
        return 0

    products = load_products()
    jobs = iter_jobs(products)
    end = len(jobs) if args.end < 0 else min(args.end, len(jobs))
    slice_jobs = jobs[args.start:end]
    generate_samples()
    run_jobs(slice_jobs, args.batch_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
