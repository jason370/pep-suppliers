const fs = require('fs');
const {execSync} = require('child_process');
const {spawnSync} = require('child_process');

// ── 1. Generate per-product vial images via Python ──────────────────────────
console.log('Generating per-product vial images...');
const py = spawnSync('python3', ['-c', `
from PIL import Image, ImageDraw, ImageFont
import base64, json, io, sys

base = Image.open('/tmp/vial.png').convert('RGB')
w, h = base.size

with open('products.json') as f:
    products = json.load(f)
visible = [p for p in products if p.get('visible')]

try:
    fn = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 9)
except:
    fn = ImageFont.load_default()

results = {}
for p in visible:
    img = base.copy()
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 90, w, h], fill=(250, 250, 249))
    name = p['name'].upper()
    cx = w // 2
    words = name.split()
    lines, line = [], ''
    for word in words:
        test = (line + ' ' + word).strip()
        if len(test) <= 13:
            line = test
        else:
            if line: lines.append(line)
            line = word
    if line: lines.append(line)
    for i, ln in enumerate(lines[:3]):
        bbox = draw.textbbox((0,0), ln, font=fn)
        tw = bbox[2] - bbox[0]
        draw.text((cx - tw//2, 100 + i*11), ln, fill=(20, 37, 62), font=fn)
    sizes = p.get('vialSizes') or []
    mg = (sizes[0] if sizes else '').upper()
    if mg:
        bbox = draw.textbbox((0,0), mg, font=fn)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        pad_x, pad_y = 6, 3
        bx1 = cx - tw//2 - pad_x
        bx2 = cx + tw//2 + pad_x
        by1 = 136
        by2 = by1 + th + pad_y*2
        draw.rounded_rectangle([bx1, by1, bx2, by2], radius=3, fill=(13, 109, 114))
        draw.text((bx1 + pad_x, by1 + pad_y), mg, fill=(255,255,255), font=fn)
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    results[p['id']] = base64.b64encode(buf.getvalue()).decode('ascii')

with open('/tmp/vial_images.json', 'w') as f:
    json.dump(results, f)
print(len(results))
`], {cwd: '/sessions/bold-fervent-goodall/mnt/Pep-Suppliers.com/site-repo', encoding: 'utf8'});

if (py.status !== 0) { console.error('Python error:', py.stderr); process.exit(1); }
console.log('Generated', py.stdout.trim(), 'vial images');

const vialImages = JSON.parse(fs.readFileSync('/tmp/vial_images.json', 'utf8'));

// ── 2. Patch index.html ──────────────────────────────────────────────────────
let h = execSync('git show HEAD:index.html', {maxBuffer: 64*1024*1024}).toString('utf8');
const before = h.length;
console.log('index.html from git HEAD, chars:', before);

// Replace each product's img src in CARD_INNER_HTML with the per-product b64
let swapped = 0;
for (const [id, b64] of Object.entries(vialImages)) {
  // Each CARD_INNER_HTML entry: "id":"<div class=\"product-image-wrap\">\r\n              <img class=\"product-vial\" src=\"data:image/png;base64,XXXX\" alt=\"...\""
  // We need to find the entry for this id and swap just the src
  const idKey = `"${id}":"`;
  const entryStart = h.indexOf(idKey);
  if (entryStart === -1) continue;
  const imgSrcTag = 'data:image/png;base64,';
  const srcStart = h.indexOf(imgSrcTag, entryStart) + imgSrcTag.length;
  const srcEnd = h.indexOf('\\"', srcStart);
  if (srcStart === -1 || srcEnd === -1) continue;
  h = h.slice(0, srcStart) + b64 + h.slice(srcEnd);
  swapped++;
}
console.log('Swapped', swapped, 'card images');

fs.writeFileSync('index.html', h, 'utf8');
console.log('index.html: before:', before, '-> after:', h.length, '| diff:', h.length - before);

// ── 3. Patch product.html ────────────────────────────────────────────────────
let ph = fs.readFileSync('product.html', 'utf8');
const phBefore = ph.length;

// Replace static vial-placeholder.jpg img with a dynamic img that gets updated by renderProduct
const OLD_IMG = `          <img src="/images/vial-placeholder.jpg" alt="Pep Suppliers vials" style="width:100%;max-width:420px;height:auto;border-radius:12px;object-fit:cover;">`;
const NEW_IMG = `          <img id="product-vial-img" src="/images/vial-placeholder.jpg" alt="Pep Suppliers vials" style="width:100%;max-width:420px;height:auto;border-radius:12px;object-fit:cover;">`;
if (!ph.includes(OLD_IMG)) { console.error('ERROR: product.html img not found'); process.exit(1); }
ph = ph.replace(OLD_IMG, NEW_IMG);

// Add VIAL_IMAGES map and update renderProduct to swap the image
const OLD_RENDER = `  function renderProduct(p) {
    product = p;
    document.getElementById('product-name').textContent = p.name || '';`;

// Build the VIAL_IMAGES JS object (only include what's needed — product ids as keys)
const vialMapEntries = Object.entries(vialImages).map(([id, b64]) => `"${id}":"data:image/png;base64,${b64}"`).join(',\n    ');
const NEW_RENDER = `  var VIAL_IMAGES = {\n    ${vialMapEntries}\n  };\n\n  function renderProduct(p) {\n    product = p;\n    var vi = document.getElementById('product-vial-img');\n    if (vi && VIAL_IMAGES[p.id]) vi.src = VIAL_IMAGES[p.id];\n    document.getElementById('product-name').textContent = p.name || '';`;

if (!ph.includes(OLD_RENDER)) { console.error('ERROR: product.html renderProduct not found'); process.exit(1); }
ph = ph.replace(OLD_RENDER, NEW_RENDER);

fs.writeFileSync('product.html', ph, 'utf8');
console.log('product.html: before:', phBefore, '-> after:', ph.length, '| diff:', ph.length - phBefore);
