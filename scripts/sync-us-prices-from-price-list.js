/**
 * Sync US Warehouse catalog from pep-suppliers-us-warehouse-price-list.html ONLY.
 * Updates products.json only. US Warehouse card prices are applied at runtime from products.json.
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
    out = out.replace(pricePat, (_, a, b) => a + price + b);
  } else {
    const addPat = new RegExp(`(<span class="size-pill[^"]*")([^>]*>\\s*${escSize(size)}\\s*</span>)`);
    if (addPat.test(out)) out = out.replace(addPat, (_, a, b) => `${a} data-price="${price}"${b}`);
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

// Parse price list rows from pep-suppliers-us-warehouse-price-list.html only
const byCode = new Map();
const byNameSize = new Map();
// Peptide Price List: Product · Size · 1 Vial (US) · Kit (China) — use US column only
const rowPatterns = [
  /<td>([^<]*)<\/td>\s*<td class="size">([^<]*)<\/td>\s*<td class="price">([^<]*)<\/td>\s*<td class="price">[^<]*<\/td>/gi,
  /<td>([^<]*)<\/td>\s*<td class="size">([^<]*)<\/td>\s*<td class="price">([^<]*)<\/td>(?!\s*<td)/gi,
  /<td[^>]*class="code"[^>]*>([^<]*)<\/td>\s*<td[^>]*class="name"[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*class="price"[^>]*>([^<]*)<\/td>/gi,
];

let rowCount = 0;
for (const re of rowPatterns) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(priceListHtml))) {
    let code, fullName, size, price;
    if (re.source.includes('class="code"')) {
      code = decodeEntities(m[1]).trim();
      fullName = decodeEntities(m[2]).trim();
      price = money(m[3]);
      size = parseSizeFromName(fullName);
    } else if (re.source.includes('class="size"')) {
      fullName = decodeEntities(m[1]).trim();
      const sizeDisplay = decodeEntities(m[2]).trim();
      size = normSize(sizeDisplay);
      price = money(m[3]);
      code = null;
      if (!price) continue;
      rowCount++;
      const key = norm(fullName) + '|' + size;
      byNameSize.set(key, { price, code: code || '', sizeDisplay });
      continue;
    } else if (m.length >= 5) {
      fullName = decodeEntities(m[1]).trim();
      size = decodeEntities(m[2]).trim().toLowerCase().replace(/\s+/g, '');
      code = decodeEntities(m[3]).trim();
      price = money(m[4]);
    } else {
      continue;
    }
    if (!price) continue;
    rowCount++;
    if (code) byCode.set(code, { price, fullName, size });
    if (fullName && size) {
      const key = norm(fullName) + '|' + size;
      if (!byNameSize.has(key)) {
        byNameSize.set(key, { price, code: code || '', sizeDisplay: size });
      }
    }
  }
}

const ALIASES = {
  'bpc-157 & tb-500 blend': 'bpc 157 & tb 500 blend',
  'cjc-1295 no dac (mod grf 1-29)': 'cjc 1295 no dac mod grf 1 29',
  'cjc-1295 dac': 'cjc 1295 dac',
  'tb-500 (thymosin beta 4)': 'tb 500 thymosin beta 4',
  'ghk-cu (copper)': 'ghk cu copper',
  'pt-141 (bremelanotide)': 'pt 141 bremelanotide',
  'n-acetyl selank': 'n acetyl selank',
  'n-acetyl semax': 'n acetyl semax',
  'hgh 191aa (somatropin)': 'hgh 191aa somatropin',
  'kisspeptin-10': 'kisspeptin 10',
  'fragment 176-191': 'fragment 176 191',
  'acth 1-39': 'acth 1 39',
  'adipotide (ftpp)': 'adipotide ftpp',
  'gonadorelin (gnrh)': 'gonadorelin gnrh',
};

const byProduct = new Map();
for (const [k, v] of byNameSize.entries()) {
  const [base, sz] = k.split('|');
  if (!byProduct.has(base)) byProduct.set(base, []);
  byProduct.get(base).push({ size: v.sizeDisplay || sz, price: v.price, code: v.code || '' });
}

function productListKey(productName) {
  const k = norm(productName);
  if (byProduct.has(k)) return k;
  if (ALIASES[k] && byProduct.has(ALIASES[k])) return ALIASES[k];
  for (const pk of byProduct.keys()) {
    if (pk === k) return pk;
    if (pk.replace(/\s+/g, '') === k.replace(/\s+/g, '')) return pk;
  }
  for (const pk of byProduct.keys()) {
    if (pk.includes(k) || k.includes(pk)) return pk;
  }
  return null;
}

function parsePills(cardHtml) {
  const pills = [];
  const re = /<span class="size-pill([^"]*)"([^>]*)>([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(cardHtml))) {
    const attrs = m[2];
    pills.push({
      size: m[3].trim(),
      code: (attrs.match(/data-code="([^"]*)"/) || [])[1] || '',
      img: (attrs.match(/data-img="([^"]*)"/) || [])[1] || '',
      price: (attrs.match(/data-price="([^"]*)"/) || [])[1] || '',
      active: /active/.test(m[1] + m[2]),
    });
  }
  return pills;
}

function normSize(size) {
  return String(size).toLowerCase().replace(/\s+/g, '');
}

function rebuildSizePills(cardHtml, entries, productId) {
  if (!entries.length) return cardHtml;
  const existing = parsePills(cardHtml);
  const bySize = new Map(existing.map((p) => [normSize(p.size), p]));
  const imgs = _sizeImages[productId] || {};
  const pillsHtml = entries
    .map((entry, i) => {
      const ex = bySize.get(normSize(entry.size)) || {};
      const code = entry.code || ex.code;
      const img = ex.img || imgs[entry.size] || imgs[entry.size.replace(/\/vial$/, '')] || '';
      const active = i === 0 ? ' active' : '';
      let attrs = ` data-price="${entry.price}"`;
      if (code) attrs += ` data-code="${code}"`;
      if (img) attrs += ` data-img="${img}"`;
      return `<span class="size-pill${active}"${attrs}>${entry.size}</span>`;
    })
    .join('');
  return cardHtml.replace(/(<div class="size-pills">)[\s\S]*?(<\/div>)/, `$1${pillsHtml}$2`);
}

function lookupPrice(productName, size, code) {
  const sizeNorm = String(size).toLowerCase().replace(/\s+/g, '');
  if (code && byCode.has(code)) {
    return { price: byCode.get(code).price, via: 'code:' + code };
  }
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
  return null;
}

let updatedProducts = 0;
let updatedSizes = 0;
const report = [];
const missing = [];

for (const p of products) {
  if (p.warehouse !== 'US Warehouse' || !p.visible) continue;
  const listKey = productListKey(p.name);
  const listEntries = listKey ? byProduct.get(listKey) || [] : [];
  const nextPrices = {};
  const nextSizes = [];
  const nextCatalogNos = {};
  let changed = false;

  if (listEntries.length) {
    for (const entry of listEntries) {
      const code = entry.code || catalogCode(p, entry.size);
      nextSizes.push(entry.size);
      nextPrices[entry.size] = entry.price;
      if (code) nextCatalogNos[entry.size] = code;
      if ((p.prices || {})[entry.size] !== entry.price) {
        report.push(`${p.name} ${entry.size}: ${(p.prices || {})[entry.size] || '-'} -> ${entry.price}`);
        changed = true;
        updatedSizes++;
      }
    }
    p.vialSizes = nextSizes;
    p.prices = nextPrices;
    p.catalogNos = nextCatalogNos;
    const rng = rangeFromPrices(nextPrices);
    if (rng) p.price = rng;
    if (changed) updatedProducts++;
    continue;
  }

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
console.log('products.json updated (CARD_INNER_HTML unchanged — prices applied at runtime)');

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
