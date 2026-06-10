/**
 * RC-029 — shared vial image pipeline
 * Generates one transparent PNG per visible product from vial_test.png master.
 * Run: node scripts/generate-vial-images.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'vial_test.png');
const OUT_DIR = path.join(ROOT, 'images', 'vials');
const PRODUCTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));

const BG_SAMPLES = [
  { r: 1, g: 18, b: 46 },
  { r: 1, g: 16, b: 42 },
  { r: 38, g: 52, b: 76 },
];
const BG_TOL = 58;

function escSvg(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapName(name, max = 14) {
  const words = name.toUpperCase().split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = (line ? line + ' ' : '') + word;
    if (test.length <= max) line = test;
    else {
      if (line) lines.push(line);
      line = word.length > max ? word.slice(0, max) : word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function labelSvg(lines, mg, w) {
  const cx = w / 2;
  const fontSize = lines.some((l) => l.length > 16) ? 17 : lines.length > 2 ? 18 : 22;
  const lineH = fontSize + 5;
  const nameStartY = 598 - ((lines.length - 1) * lineH) / 2;
  const nameEls = lines
    .map((ln, i) => {
      const y = nameStartY + i * lineH;
      return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="700" fill="#071833">${escSvg(ln)}</text>`;
    })
    .join('');
  const mgText = escSvg((mg || '').toUpperCase());
  const badgeW = Math.max(74, mgText.length * 11 + 28);
  const bx = cx - badgeW / 2;
  const by = 678;
  const bh = 34;
  return Buffer.from(`<svg width="${w}" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect x="50" y="462" width="${w - 100}" height="292" fill="#ffffff"/>
  <text x="${cx}" y="492" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#071833">PEP SUPPLIERS</text>
  ${nameEls}
  <rect x="${bx}" y="${by}" width="${badgeW}" height="${bh}" rx="6" fill="#0D6D72"/>
  <text x="${cx}" y="${by + 23}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700" fill="#ffffff">${mgText}</text>
</svg>`);
}

function bgDistance(r, g, b) {
  let min = Infinity;
  for (const s of BG_SAMPLES) {
    const dr = r - s.r;
    const dg = g - s.g;
    const db = b - s.b;
    const d = Math.sqrt(dr * dr + dg * dg + db * db);
    if (d < min) min = d;
  }
  return min;
}

function removeNavyBackground(data, info) {
  const { width: w, height: h } = info;
  const out = Buffer.from(data);
  const total = w * h;
  const bgMask = new Uint8Array(total);
  const queue = [];

  function tryPush(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (bgMask[i]) return;
    const o = i * 4;
    const r = out[o];
    const g = out[o + 1];
    const b = out[o + 2];
    const dist = bgDistance(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const isBg = dist <= BG_TOL || (lum < 72 && b >= g && g >= r - 6);
    if (!isBg) return;
    bgMask[i] = 1;
    queue.push(i);
  }

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  while (queue.length) {
    const i = queue.pop();
    const x = i % w;
    const y = (i / w) | 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r = out[o];
    const g = out[o + 1];
    const b = out[o + 2];
    const dist = bgDistance(r, g, b);
    let alpha = 255;
    if (bgMask[i]) alpha = 0;
    else if (dist < BG_TOL + 36) alpha = Math.round(((dist - BG_TOL) / 36) * 255);
    out[o + 3] = Math.max(0, Math.min(255, alpha));
  }
  return out;
}

async function renderVial(product) {
  const meta = await sharp(BASE).metadata();
  const w = meta.width;
  const lines = wrapName(product.name);
  const mg = (product.vialSizes && product.vialSizes[0]) || '';
  const svg = labelSvg(lines, mg, w);

  const composited = await sharp(BASE)
    .composite([{ input: svg, top: 0, left: 0 }])
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const keyed = removeNavyBackground(composited.data, composited.info);

  const outPath = path.join(OUT_DIR, `${product.id}.png`);
  await sharp(keyed, {
    raw: { width: composited.info.width, height: composited.info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);

  return outPath;
}

async function main() {
  if (!fs.existsSync(BASE)) throw new Error('Missing vial_test.png master asset');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const visible = PRODUCTS.filter((p) => p.visible !== false);
  const map = {};
  let ok = 0;
  for (const p of visible) {
    await renderVial(p);
    map[p.id] = `/images/vials/${p.id}.png`;
    ok++;
    if (ok % 20 === 0) console.log(`  ${ok}/${visible.length}`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(map, null, 2));
  console.log(`Generated ${ok} transparent vials -> ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
