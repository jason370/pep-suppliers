/**
 * Sync US Warehouse catalog from pep-suppliers-us-warehouse-price-list.html ONLY.
 * Updates products.json and index.html CARD_INNER_HTML size-pill data-price values.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const productsPath = path.join(root, 'products.json');
const indexPath = path.join(root, 'index.html');
const priceListPath = path.join(root, 'pep-suppliers-us-warehouse-price-list.html');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
const priceListHtml = fs.readFileSync(priceListPath, 'utf8');

const cardPrefix = '  var CARD_INNER_HTML = ';
const sizeMarkers = [';\r\n  window._sizeImages = ', ';\n  window._sizeImages = '];
const cardStart = indexHtml.indexOf(cardPrefix);
let sizeStart = -1;
let sizePrefix = '';
for (const marker of sizeMarkers) {
  const pos = indexHtml.indexOf(marker, cardStart);
  if (pos >= 0) {
    sizeStart = pos;
    sizePrefix = marker;
    break;
  }
}
if (sizeStart < 0) {
  console.error('Could not find window._sizeImages in index.html');
  process.exit(1);
}
const CARD_INNER_HTML = JSON.parse(indexHtml.slice(cardStart + cardPrefix.length, sizeStart));
const sizeJsonStart = sizeStart + sizePrefix.length;
let sizeEnd = indexHtml.indexOf(';\r\n', sizeJsonStart);
if (sizeEnd < 0) sizeEnd = indexHtml.indexOf(';\n', sizeJsonStart);
const _sizeImages = JSON.parse(indexHtml.slice(sizeJsonStart, sizeEnd));

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
    .replace(/[+]/g, ' & ')
    .replace(/[^a-z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSizeFromName(name) {
  const m = String(name).match(/(\d+(?:\.\d+)?)\s*(mg|mcg|iu|g|ml)\b/i);
  if (!m) return null;
  let unit = m[2].toLowerCase();
  return m[1] + unit;
}

function baseFromName(name) {
  return decodeEntities(name)
    .replace(/\s+\d+(?:\.\d+)?\s*(mg|mcg|iu|g|ml)(?:\/[\w.]+)*/i, '')
    .trim();
}

function money(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return null;
  if (Number.isInteger(n)) return '$' + n;
  return '$' + n.toFixed(2);
}

function rangeFromPrices(prices) {
  const vals = Object.values(prices || {})
    .map((p) => parseFloat(String(p).replace(/[^0-9.]/g, '')))
    .filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) return money(min);
  return money(min) + ' – ' + money(max);
}

function escSize(size) {
  return size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function setPillPrice(cardHtml, size, price, code) {
  if (!cardHtml || !price) return cardHtml;
  let out = cardHtml;
  const pricePat = new RegExp(
    `(<span class="size-pill[^"]*"[^>]*data-price=")[^"]*("[^>]*>\\s*${escSize(size)}\\s*</span>)`
  );
  if (pricePat.test(out)) {
    out = out.replace(pricePat, `$1${price}$2`);
  } else {
    const addPat = new RegExp(`(<span class="size-pill[^"]*")([^>]*>\\s*${escSize(size)}\\s*</span>)`);
    if (addPat.test(out)) out = out.replace(addPat, `$1 data-price="${price}"$2`);
  }
  if (code) {
    const codePat = new RegExp(`(<span class="size-pill[^"]*")([^>]*>\\s*${escSize(size)}\\s*</span>)`);
    if (out.includes(`data-code="${code}"`)) return out;
    if (codePat.test(out)) {
      out = out.replace(codePat, (m, a, b) => {
        if (/data-code=/.test(m)) return m.replace(/data-code="[^"]*"/, `data-code="${code}"`);
        return `${a} data-code="${code}"${b}`;
      });
    }
  }
  return out;
}

function catalogCode(product, size) {
  const paths = [
    (product.catalogNos || {})[size],
    (_sizeImages[product.id] || {})[size],
    (product.vialImages || {})[size],
  ];
  for (const p of paths) {
    if (!p) continue;
    if (typeof p === 'string' && !p.includes('/') && !p.endsWith('.png')) return p;
    const base = path.basename(String(p).replace(/\\/g, '/'), '.png');
    if (base) return base;
  }
  return null;
}

// Parse price list rows (3-col with classes OR 4-col plain td)
const byCode = new Map();
const byNameSize = new Map();
const rowPatterns = [
  /<td[^>]*class="code"[^>]*>([^<]*)<\/td>\s*<td[^>]*class="name"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="price"[^>]*>([^<]*)<\/td>/gi,
  /<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<td class="price">([^<]+)<\/td>/gi,
];

let rowCount = 0;
for (const re of rowPatterns) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(priceListHtml))) {
    const code = decodeEntities(m[1]).trim();
    const fullName = decodeEntities(m[2]).trim();
    const price = money(m[3]);
    if (!code || !price) continue;
    rowCount++;
    byCode.set(code, { price, fullName });
    const size = parseSizeFromName(fullName);
    const base = baseFromName(fullName);
    if (size && base) {
      const key = norm(base) + '|' + size.toLowerCase();
      byNameSize.set(key, { price, code });
    }
  }
}

const ALIASES = {
  'bpc-157 & tb-500 blend': 'bpc 157 & tb 500 blend',
  'cjc-1295 no dac (mod grf 1-29)': 'cjc 1295 no dac',
  'cjc-1295 dac': 'cjc 1295 with dac',
  'cjc-1295 & ipamorelin blend': 'cjc 1295 no dac 5mg ipamorelin 5mg',
  'tesamorelin & ipamorelin blend': 'tesamorelin & ipamorelin blend',
  'tb-500 (thymosin beta 4)': 'tb 500',
  'ghk-cu (copper)': 'ghk cu',
  'pt-141 (bremelanotide)': 'pt 141',
  'n-acetyl selank': 'selank',
  'n-acetyl semax': 'semax',
  'hgh 191aa (somatropin)': 'hgh 191aa somatropin',
  'kisspeptin-10': 'kisspeptin 10',
  'fragment 176-191': 'hgh fragment 176 191',
};

function lookupPrice(productName, size, code) {
  const sizeNorm = String(size).toLowerCase().replace(/\s+/g, '');
  let key = norm(productName);
  if (ALIASES[key]) key = ALIASES[key];
  const nsKey = key + '|' + sizeNorm;
  if (byNameSize.has(nsKey)) {
    const hit = byNameSize.get(nsKey);
    return { price: hit.price, via: 'name:' + hit.code };
  }
  for (const [k, v] of byNameSize.entries()) {
    const [base, sz] = k.split('|');
    if (sz !== sizeNorm) continue;
    if (base === key || base.includes(key) || key.includes(base)) {
      return { price: v.price, via: 'fuzzy:' + v.code };
    }
  }
  if (code && byCode.has(code)) return { price: byCode.get(code).price, via: 'code:' + code };
  return null;
}

let updatedProducts = 0;
let updatedSizes = 0;
const report = [];
const missing = [];

for (const p of products) {
  if (p.warehouse !== 'US Warehouse' || !p.visible) continue;
  const nextPrices = {};
  let changed = false;

  for (const size of p.vialSizes || []) {
    const code = catalogCode(p, size);
    const hit = lookupPrice(p.name, size, code);
    if (!hit) {
      missing.push(`${p.name} ${size} (code ${code || '?'})`);
      continue;
    }
    nextPrices[size] = hit.price;
    if ((p.prices || {})[size] !== hit.price) {
      report.push(`${p.name} ${size}: ${(p.prices || {})[size] || '-'} -> ${hit.price} (${hit.via})`);
      changed = true;
      updatedSizes++;
    }
    if (CARD_INNER_HTML[p.id]) {
      CARD_INNER_HTML[p.id] = setPillPrice(CARD_INNER_HTML[p.id], size, hit.price, code);
    }
    if (code) {
      p.catalogNos = p.catalogNos || {};
      p.catalogNos[size] = code;
    }
  }

  if (Object.keys(nextPrices).length) {
    p.prices = nextPrices;
    const rng = rangeFromPrices(nextPrices);
    if (rng) p.price = rng;
    if (changed) updatedProducts++;
  }
}

fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + '\n', 'utf8');

const lineTerm = sizePrefix.slice(0, sizePrefix.indexOf('window'));
const newBlock =
  cardPrefix +
  JSON.stringify(CARD_INNER_HTML) +
  sizePrefix +
  JSON.stringify(_sizeImages) +
  lineTerm;
fs.writeFileSync(indexPath, indexHtml.slice(0, cardStart) + newBlock + indexHtml.slice(sizeEnd + lineTerm.length), 'utf8');

// Fix price list title for site branding
let pl = fs.readFileSync(priceListPath, 'utf8');
pl = pl.replace(/<title>US Warehouse<\/title>/, '<title>Pep-Suppliers US Warehouse Price List</title>');
pl = pl.replace(/<h1>US Warehouse<\/h1>/, '<h1>Pep-Suppliers US Warehouse</h1>');
fs.writeFileSync(priceListPath, pl, 'utf8');

console.log(`Price list rows parsed: ${rowCount}`);
console.log(`Products updated: ${updatedProducts}`);
console.log(`Size prices updated: ${updatedSizes}`);
console.log('Sample changes:');
report.slice(0, 30).forEach((l) => console.log(' ', l));
if (report.length > 30) console.log(`  ... +${report.length - 30} more`);
if (missing.length) {
  console.log(`Missing (${missing.length}):`);
  missing.slice(0, 15).forEach((l) => console.log(' ', l));
}

// Spot check
for (const name of ['5-Amino-1MQ', 'BPC-157']) {
  const p = products.find((x) => x.name === name && x.visible);
  if (p) console.log('VERIFY', name, p.prices);
}
