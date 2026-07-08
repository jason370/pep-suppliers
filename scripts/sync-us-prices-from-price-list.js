/**
 * Sync products.json US Warehouse vial prices from the published US price list.
 * Prefer price-list HTML matches; fall back to CARD_INNER_HTML pill prices.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const productsPath = path.join(root, 'products.json');
const priceListPath = path.join(root, 'pep-suppliers-us-warehouse-price-list.html');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
const priceListHtml = fs.readFileSync(priceListPath, 'utf8');

const cardMatch = indexHtml.match(/var CARD_INNER_HTML = (\{[\s\S]*?\});\s*\n\s*window\._sizeImages/);
if (!cardMatch) {
  console.error('Could not parse CARD_INNER_HTML');
  process.exit(1);
}
const CARD_INNER_HTML = JSON.parse(cardMatch[1]);

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function norm(s) {
  return decodeEntities(s)
    .toLowerCase()
    .replace(/[+]/g, '&')
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSizeFromName(name) {
  const m = String(name).match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu|g|ml)\b/i);
  if (!m) return null;
  return m[1] + m[2].toLowerCase();
}

function baseFromName(name) {
  return decodeEntities(name)
    .replace(/\s+\d+(?:\.\d+)?\s*(mg|mcg|iu|g|ml)(?:\/[\w.]+)*/i, '')
    .replace(/\s+$/g, '')
    .trim();
}

function money(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return '$' + n.toFixed(2);
}

function rangeFromPrices(prices) {
  const vals = Object.values(prices || {})
    .map((p) => parseFloat(String(p).replace(/[^0-9.]/g, '')))
    .filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) return '$' + min.toFixed(2);
  return '$' + min.toFixed(2) + ' – $' + max.toFixed(2);
}

function cardPrices(productId) {
  const html = CARD_INNER_HTML[productId] || '';
  const out = {};
  for (const m of html.matchAll(/<span class="size-pill[^"]*"[^>]*>([^<]+)<\/span>/g)) {
    const size = m[1].trim();
    const tagStart = html.lastIndexOf('<span', m.index);
    const tagEnd = html.indexOf('</span>', m.index) + 7;
    const tag = html.slice(tagStart, tagEnd);
    const pm = tag.match(/data-price="([^"]*)"/);
    if (pm && pm[1]) out[size] = money(pm[1]);
  }
  return out;
}

// Build price-list map: baseNorm -> { sizeNorm -> price }
const byBase = new Map();
const rowRe = /<td class="code">[\s\S]*?<\/td>\s*<td class="name">(.*?)<\/td>\s*<td class="price">(.*?)<\/td>/g;
let row;
let rowCount = 0;
while ((row = rowRe.exec(priceListHtml))) {
  rowCount++;
  const fullName = decodeEntities(row[1]).trim();
  const price = money(row[2]);
  const size = parseSizeFromName(fullName);
  const base = baseFromName(fullName);
  const key = norm(base);
  if (!byBase.has(key)) byBase.set(key, {});
  if (size && price) byBase.get(key)[size] = price;
  // also keep full-name exact for odd sizes like 10mg/ml/vial
  byBase.get(key)['__full:' + norm(fullName)] = price;
}

// Name aliases for products whose catalog name differs slightly from price-list base
const ALIASES = {
  'bpc-157 & tb-500 blend': 'bpc 157 & tb 500 blend',
  'cjc-1295 & ipamorelin blend': 'cjc 1295 & ipamorelin blend',
  'tesamorelin & ipamorelin blend': 'tesamorelin & ipamorelin blend',
  'aod 9604': 'aod 9604',
  'lc216': 'lc216',
  'lemon bottle': 'lemon bottle',
};

function lookupListPrices(productName) {
  const key = norm(productName);
  if (byBase.has(key)) return byBase.get(key);
  if (ALIASES[key] && byBase.has(ALIASES[key])) return byBase.get(ALIASES[key]);
  // fuzzy contains
  for (const [k, v] of byBase.entries()) {
    if (k === key || k.includes(key) || key.includes(k)) return v;
  }
  return null;
}

let updatedProducts = 0;
let updatedSizes = 0;
const report = [];

for (const p of products) {
  if (p.warehouse !== 'US Warehouse') continue;
  const list = lookupListPrices(p.name) || {};
  const fromCard = cardPrices(p.id);
  const nextPrices = { ...(p.prices || {}) };
  let changed = false;

  const sizes = [...new Set([...(p.vialSizes || []), ...Object.keys(nextPrices), ...Object.keys(fromCard)])];
  for (const size of sizes) {
    const sizeNorm = String(size).toLowerCase().replace(/\s+/g, '');
    let newPrice = list[sizeNorm] || fromCard[size] || null;
    // odd formats: try strip trailing path like 10mg/ml/vial for LC216
    if (!newPrice && list) {
      for (const [k, v] of Object.entries(list)) {
        if (k.startsWith('__full:') && k.includes(sizeNorm)) newPrice = v;
      }
    }
    if (!newPrice) continue;
    if (nextPrices[size] !== newPrice) {
      report.push(`${p.name} ${size}: ${nextPrices[size] || '(missing)'} -> ${newPrice}`);
      nextPrices[size] = newPrice;
      changed = true;
      updatedSizes++;
    }
  }

  if (changed || !p.prices) {
    p.prices = nextPrices;
    const rng = rangeFromPrices(nextPrices);
    if (rng) p.price = rng;
    updatedProducts++;
  }
}

fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + '\n', 'utf8');
console.log(`Price list rows parsed: ${rowCount}`);
console.log(`Products updated: ${updatedProducts}`);
console.log(`Size prices updated: ${updatedSizes}`);
console.log('Sample changes:');
report.slice(0, 25).forEach((l) => console.log(' ', l));
if (report.length > 25) console.log(`  ... +${report.length - 25} more`);
