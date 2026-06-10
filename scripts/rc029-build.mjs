/**
 * RC-029 — rebuild catalog cards + product page vial map
 * Run: node scripts/rc029-build.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const CAT_DISPLAY = {
  gh: 'GROWTH HORMONE PEPTIDES',
  weight: 'WEIGHT MANAGEMENT',
  healing: 'HEALING & RECOVERY',
  nootropic: 'NOOTROPICS',
  sexual: 'SEXUAL HEALTH',
  other: 'RESEARCH PEPTIDE',
};

const CAT_FROM_JSON = {
  'Hormone Support': 'gh',
  'Weight Management': 'weight',
  'Recovery & Healing': 'healing',
  'Peptide Blends': 'other',
  'Other Research': 'other',
};

function resolveCategoryKey(p) {
  const id = (p.id || '').toLowerCase();
  const name = (p.name || '').toLowerCase();
  if (/selank|semax/.test(id) || /selank|semax/.test(name)) return 'nootropic';
  if (/pt-141|bremelanotide|melanotan/.test(id) || /pt-141|bremelanotide|melanotan/.test(name)) return 'sexual';
  return CAT_FROM_JSON[p.category] || 'other';
}

function categoryDisplay(p) {
  return CAT_DISPLAY[resolveCategoryKey(p)] || CAT_DISPLAY.other;
}

function saleMeta(priceStr, id) {
  const n = parseFloat(String(priceStr).replace(/[^0-9.]/g, '')) || 0;
  const orig = (n * 1.25).toFixed(2);
  const h = hashStr(id);
  const rating = (4.7 + (h % 30) / 100).toFixed(1);
  const reviews = 120 + (h % 280);
  return { sale: n ? `$${n.toFixed(2)}` : priceStr, orig: `$${orig}`, rating, reviews };
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function buildCardInner(p) {
  const { sale, orig, rating, reviews } = saleMeta(p.price, p.id);
  const src = `/images/vials/${p.id}.png`;
  const cat = escAttr(categoryDisplay(p));
  const name = escAttr(p.name || '');
  return (
    `<div class="card-img-wrap"><span class="sale-badge">Sale</span>` +
    `<img class="card-vial" src="${src}" alt="${name}" loading="lazy" decoding="async"></div>` +
    `<div class="card-info"><p class="card-category">${cat}</p>` +
    `<h3 class="card-name">${name}</h3>` +
    `<div class="card-stars" aria-hidden="true">★★★★★ <span>${rating} (${reviews})</span></div>` +
    `<div class="card-price-row"><span class="card-price-orig">${orig}</span>` +
    `<span class="card-price">${escAttr(sale)}</span></div>` +
    `<a class="card-btn" href="/product.html?id=${escAttr(p.id)}">Select options</a></div>`
  );
}

const CARD_CSS = `
.products-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:21px}
.product-card{
  border:1px solid var(--border);
  border-radius:14px;
  background:#fff;
  box-shadow:var(--shadow-soft);
  overflow:hidden;
  display:flex;
  flex-direction:column;
  min-height:0;
  padding:0;
  transition:.18s ease;
  cursor:pointer;
}
.product-card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,.12);border-color:#d8d2e8}
.card-img-wrap{
  position:relative;
  background:#ede9f6;
  height:220px;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:12px 16px 8px;
}
.sale-badge{
  position:absolute;top:12px;right:12px;
  background:#7c3aed;color:#fff;
  font-size:11px;font-weight:800;
  padding:4px 10px;border-radius:20px;
  letter-spacing:.5px;text-transform:uppercase;z-index:2;
}
.card-vial{
  max-height:68%;
  max-width:88%;
  width:auto;height:auto;
  object-fit:contain;
  filter:drop-shadow(0 10px 22px rgba(7,24,51,.16));
}
.card-info{padding:16px;display:flex;flex-direction:column;flex:1}
.card-category{
  font-size:11px;font-weight:700;color:#7c6f94;
  text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;
}
.card-name{margin:0 0 6px;color:var(--navy);font-size:18px;font-weight:900;line-height:1.2}
.card-stars{color:#f59e0b;font-size:13px;margin:0 0 10px}
.card-stars span{color:#6b7280;font-size:12px;margin-left:4px}
.card-price-row{display:flex;align-items:baseline;gap:8px;margin:0 0 14px}
.card-price-orig{font-size:13px;color:#9ca3af;text-decoration:line-through}
.card-price{font-size:20px;font-weight:900;color:#111}
.card-btn{
  display:block;width:100%;margin-top:auto;padding:11px;
  background:#fff;border:2px solid #111;border-radius:8px;
  font-size:13px;font-weight:800;color:#111;text-align:center;
  text-decoration:none;letter-spacing:.3px;transition:background .15s,color .15s;
}
.card-btn:hover{background:#111;color:#fff}
`;

const EXPANDED_CSS = `
/* RC-029 GhostLabz-style catalog cards */
.expanded-product{min-height:0}
.expanded-product .card-img-wrap{height:220px}
.expanded-product .card-vial{max-height:68%}
@media(min-width:1201px){.products-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:1200px){.products-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.products-grid{grid-template-columns:1fr}}
`;

function readIndexFromGit() {
  const r = spawnSync('git', ['show', 'HEAD:index.html'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git show HEAD:index.html failed: ' + (r.stderr || r.stdout));
  return r.stdout;
}

function patchCardInnerOnly() {
  let h = readIndexFromGit();
  const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
  const visible = products.filter((p) => p.visible !== false);
  const cardMap = {};
  visible.forEach((p) => {
    cardMap[p.id] = buildCardInner(p);
  });
  const cardJson = JSON.stringify(cardMap)
    .replace(/\//g, '\\/')
    .replace(/\\n/g, '\\\\n');
  const start = h.indexOf('var CARD_INNER_HTML = ');
  const endMatch = h.slice(start).match(/\}\r?\n\r?\n  function escAttr/);
  if (start === -1 || !endMatch) throw new Error('CARD_INNER_HTML block not found in index.html');
  const end = start + endMatch.index + 1;
  h = h.slice(0, start) + 'var CARD_INNER_HTML = ' + cardJson + h.slice(end);
  fs.writeFileSync(path.join(ROOT, 'index.html'), h, 'utf8');
  console.log('Patched CARD_INNER_HTML only —', visible.length, 'cards');
}

function patchIndexHtml() {
  let h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
  const visible = products.filter((p) => p.visible !== false);

  // Replace primary product-card CSS block
  h = h.replace(
    /\.products-grid\{display:grid;grid-template-columns:repeat\(4,1fr\);gap:21px\}[\s\S]*?\.view-options\{[\s\S]*?box-shadow:0 10px 18px rgba\(7,24,51,\.16\);\s*\}/,
    CARD_CSS.trim()
  );

  // Neutralize legacy duplicate overrides
  h = h.replace(
    /\.product-card\{\s*grid-template-columns:104px 1fr;\s*min-height:236px;\s*padding:15px;\s*gap:12px;\s*\}/g,
    '/* RC-029: legacy horizontal card override removed */'
  );
  h = h.replace(
    /\.product-vial\{\s*max-width:96px;\s*height:178px;\s*\}/g,
    '/* RC-029: legacy vial sizing removed */'
  );
  h = h.replace(
    /\.expanded-product\{[\s\S]*?line-height:1\.18;\s*\}/,
    EXPANDED_CSS.trim()
  );
  h = h.replace(
    /@media\(max-width:560px\)\{[\s\S]*?\.product-card\{grid-template-columns:110px 1fr\}/,
    (m) => m.replace(/\s*\.product-card\{grid-template-columns:110px 1fr\}/, '')
  );

  const cardMap = {};
  visible.forEach((p) => {
    cardMap[p.id] = buildCardInner(p);
  });
  const cardJson = JSON.stringify(cardMap)
    .replace(/\//g, '\\/')
    .replace(/\\n/g, '\\\\n');

  const start = h.indexOf('var CARD_INNER_HTML = ');
  const endMatch = h.slice(start).match(/\}\r?\n\r?\n  function escAttr/);
  if (start === -1 || !endMatch) throw new Error('CARD_INNER_HTML block not found in index.html');
  const end = start + endMatch.index + 1;
  h = h.slice(0, start) + 'var CARD_INNER_HTML = ' + cardJson + h.slice(end);

  fs.writeFileSync(path.join(ROOT, 'index.html'), h, 'utf8');
  console.log('Patched index.html —', visible.length, 'cards');
}

function patchProductHtml() {
  let h = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'images', 'vials', 'manifest.json'), 'utf8'));

  h = h.replace(
    /\.product-visual\{[^}]+\}/,
    '.product-visual{background:#ede9f6;border:1px solid var(--border);border-radius:20px;padding:32px 24px;display:flex;align-items:center;justify-content:center;min-height:420px}'
  );
  h = h.replace(
    /<img src="\/images\/vial-placeholder\.jpg"[^>]*>/,
    '<img id="product-vial-img" class="product-vial-img" src="/images/vial-placeholder.jpg" alt="Product vial">'
  );

  if (!h.includes('.product-vial-img')) {
    h = h.replace(
      /\.product-visual svg\{[^}]+\}/,
      `.product-vial-img{max-width:min(320px,78%);max-height:380px;width:auto;height:auto;object-fit:contain;filter:drop-shadow(0 14px 28px rgba(7,24,51,.18))}`
    );
  }

  const mapEntries = Object.entries(manifest)
    .map(([id, src]) => `"${id}":"${src}"`)
    .join(',\n    ');

  const vialBlock = `  var VIAL_IMAGES = {\n    ${mapEntries}\n  };\n\n`;

  if (h.includes('var VIAL_IMAGES')) {
    h = h.replace(/  var VIAL_IMAGES = \{[\s\S]*?\};\n\n/, vialBlock);
  } else {
    h = h.replace('  function renderProduct(p) {', vialBlock + '  function renderProduct(p) {');
  }

  if (!h.includes('VIAL_IMAGES[p.id]')) {
    h = h.replace(
      /function renderProduct\(p\) \{\s*product = p;\s*(?!var vi)/,
      `function renderProduct(p) {
    product = p;
    var vi = document.getElementById('product-vial-img');
    if (vi) {
      vi.src = VIAL_IMAGES[p.id] || '/images/vial-placeholder.jpg';
      vi.alt = (p.name || 'Product') + ' research vial';
    }
    `
    );
  }

  // Product page id from query string (cards link with ?id=)
  if (!h.includes('URLSearchParams')) {
    h = h.replace(
      "  var productId = window.location.pathname.split('/').pop();",
      "  var productId = new URLSearchParams(window.location.search).get('id') || window.location.pathname.split('/').pop().replace(/\\.html$/,'');"
    );
  }

  fs.writeFileSync(path.join(ROOT, 'product.html'), h, 'utf8');
  console.log('Patched product.html —', Object.keys(manifest).length, 'VIAL_IMAGES entries');
}

if (process.argv.includes('--cards-only')) {
  console.log('RC-029 cards-only: regenerate CARD_INNER_HTML from HEAD:index.html...');
  patchCardInnerOnly();
  console.log('RC-029 cards-only complete.');
} else {
  console.log('Step 1: generate vial PNGs...');
  const gen = spawnSync(process.execPath, ['scripts/generate-vial-images.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (gen.status !== 0) process.exit(gen.status || 1);

  console.log('Step 2: patch index.html...');
  patchIndexHtml();
  console.log('Step 3: patch product.html...');
  patchProductHtml();
  console.log('RC-029 build complete.');
}
