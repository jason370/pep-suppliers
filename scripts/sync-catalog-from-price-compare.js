/**
 * Sync catalog numbers from price-compare.json (PRICE COMPARE — All Vendors).
 * Uses strict per-product matching to avoid BPC vs blend / CJC vs Ipamorelin collisions.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const products = JSON.parse(fs.readFileSync(path.join(root, 'products.json'), 'utf8'));
const priceCompare = JSON.parse(fs.readFileSync(path.join(root, 'price-compare.json'), 'utf8'));

const cardPrefix = '  var CARD_INNER_HTML = ';
const sizePrefix = ';\r\n  window._sizeImages = ';
const cardStart = indexHtml.indexOf(cardPrefix);
const sizeStart = indexHtml.indexOf(sizePrefix, cardStart);
const CARD_INNER_HTML = JSON.parse(indexHtml.slice(cardStart + cardPrefix.length, sizeStart));
const sizeJsonStart = sizeStart + sizePrefix.length;
const sizeEnd = indexHtml.indexOf(';\r\n', sizeJsonStart);
const _sizeImages = JSON.parse(indexHtml.slice(sizeJsonStart, sizeEnd));

/** Return true if price-compare row belongs to this catalog product. */
const ROW_MATCHERS = {
  'bpc-157-overseas-warehouse': (r) => r.name === 'BPC-157',
  'bpc-157-tb-500-blend-overseas-warehouse': (r) => r.name === 'BPC-157 + TB-500',
  'ipamorelin-overseas-warehouse': (r) => r.name === 'Ipamorelin',
  'cjc-1295-ipamorelin-blend-overseas-warehouse': (r) =>
    r.name.startsWith('CJC-1295 No DAC') && r.name.includes('Ipamorelin'),
  'cjc-1295-no-dac-mod-grf-1-29-overseas-warehouse': (r) => r.name === 'CJC-1295 No DAC',
  'cjc-1295-dac-overseas-warehouse': (r) => r.name === 'CJC-1295 With DAC',
  'tesamorelin-ipamorelin-blend-overseas-warehouse': (r) =>
    r.name.startsWith('Tesamorelin') && r.name.includes('Ipamorelin'),
  'semaglutide-overseas-warehouse': (r) => r.name === 'Semaglutide',
  'cagrilintide-semaglutide-overseas-warehouse': (r) => r.name === 'Cagrilintide + Semaglutide',
  'sm5-cgl5-overseas-warehouse': (r) => r.name === 'SM5+CGL5',
  'retatrutide-cagrilintide-overseas-warehouse': (r) => r.name === 'Retatrutide + Cagrilintide',
  'tb-500-thymosin-beta-4-overseas-warehouse': (r) => r.name === 'TB-500',
  'ghk-cu-copper-overseas-warehouse': (r) => r.name === 'GHK-CU',
  'aod-9604-overseas-warehouse': (r) => r.name === 'AOD-9604',
  'adipotide-ftpp-overseas-warehouse': (r) => r.name === 'Adipotide',
  'fragment-176-191-overseas-warehouse': (r) => r.name === 'HGH Fragment 176-191',
  'follistatin-344-overseas-warehouse': (r) => r.name === 'Follistatin',
  'gonadorelin-gnrh-overseas-warehouse': (r) => r.name === 'Gonadorelin Acetate',
  'hexarelin-overseas-warehouse': (r) => r.name === 'Hexarelin Acetate',
  'mgf-igf-1-ec-overseas-warehouse': (r) => r.name === 'MGF',
  'peg-mgf-overseas-warehouse': (r) => r.name === 'PEG MGF',
  'n-acetyl-selank-overseas-warehouse': (r) => r.name === 'Selank',
  'n-acetyl-semax-overseas-warehouse': (r) => r.name === 'Semax',
  'oxytocin-overseas-warehouse': (r) => r.name === 'Oxytocin Acetate',
  'pt-141-bremelanotide-overseas-warehouse': (r) => r.name === 'PT-141',
  'receptor-grade-igf-1-lr3-overseas-warehouse': (r) => r.name === 'IGF-1 LR3',
  'triptorelin-overseas-warehouse': (r) => r.name === 'Triptorelin Acetate',
  'aicar-overseas-warehouse': (r) => r.name === 'AICAR',
  'll-37-overseas-warehouse': (r) => r.name === 'LL37',
  'lc216-overseas-warehouse': (r) => r.name === 'LC216',
};

const NAME_EQUIV = {
  '5-Amino-1MQ': '5-Amino-1MQ',
  'Acth 1-39': 'Acth 1-39',
  'ACE-031': 'ACE-031',
  Adamax: 'Adamax',
  'ARA-290': 'ARA-290',
  'B7-33': 'B7-33',
  Bronchogen: 'Bronchogen',
  Cagrilintide: 'Cagrilintide',
  Cardiogen: 'Cardiogen',
  Cartalax: 'Cartalax',
  Cortagen: 'Cortagen',
  Crystagen: 'Crystagen',
  Dermorphin: 'Dermorphin',
  Dihexa: 'Dihexa',
  DSIP: 'DSIP',
  Dulaglutide: 'Dulaglutide',
  Epithalon: 'Epithalon',
  'FOXO4-DRI': 'FOXO4-DRI',
  GLOW: 'GLOW',
  Humanin: 'Humanin',
  'IGF-DES': 'IGF-DES',
  'KissPeptin-10': 'KissPeptin-10',
  KLOW: 'KLOW',
  KPV: 'KPV',
  'Lemon Bottle': 'Lemon Bottle',
  Liraglutide: 'Liraglutide',
  Matrixyl: 'Matrixyl',
  Mazdutide: 'Mazdutide',
  'Melanotan 1': 'Melanotan 1',
  'Melanotan 2': 'Melanotan 2',
  'MOTS-C': 'MOTS-C',
  'NAD+': 'NAD+',
  'Orexin A': 'Orexin A',
  'Orexin B': 'Orexin B',
  P21: 'P21 (P021)',
  'PE-22-28': 'PE-22-28',
  Pinealon: 'Pinealon',
  'PNC-27': 'PNC-27',
  'PTD-DBM': 'PTD-DBM',
  RA260: 'RA260',
  Retatrutide: 'Retatrutide',
  'SLU-PP-322': 'SLU-PP-322',
  'Snap-8': 'Snap-8',
  'SS-31': 'SS-31',
  Survodutide: 'Survodutide',
  Tesamorelin: 'Tesamorelin',
  Thymalin: 'Thymalin',
  'Thymosin Alpha-1': 'Thymosin Alpha-1',
  Tirzepatide: 'Tirzepatide',
  Vesugen: 'Vesugen',
  VIP: 'VIP',
  'HGH 191AA (Somatropin)': 'HGH 191AA (Somatropin)',
  Sermorelin: 'Sermorelin',
  'AHK-CU': 'AHK-CU',
};

function parseSpecSize(spec, product) {
  const s = String(spec);
  if (product.id === 'lc216-overseas-warehouse') {
    if (s.includes('10mg/ml')) return '10mg/ml/vial';
  }
  const m = s.match(/^([\d.]+)(mg|IU|ml|mcg|ug)/i);
  if (!m) return null;
  let unit = m[2].toLowerCase();
  if (unit === 'ug') unit = 'mcg';
  return m[1] + unit;
}

function normalizeSize(size) {
  return String(size).replace(/\s+/g, '').toLowerCase();
}

function rowMatchesProduct(product, row) {
  if (ROW_MATCHERS[product.id]) return ROW_MATCHERS[product.id](row);
  const equiv = NAME_EQUIV[product.name];
  if (equiv) return row.name === equiv;
  return row.name === product.name;
}

function lookupCatNo(product, size) {
  const ns = normalizeSize(size);
  const hits = priceCompare.filter((row) => {
    if (!rowMatchesProduct(product, row)) return false;
    const specSize = parseSpecSize(row.spec, product);
    return specSize && normalizeSize(specSize) === ns;
  });
  if (hits.length === 1) return hits[0].cat_no;
  if (hits.length > 1) return hits[0].cat_no;
  return null;
}

function escSize(size) {
  return size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fixCardPillImage(html, size, catNo) {
  const newImg = `images/vials/${catNo}.png`;
  const re = new RegExp(
    `(<span class="size-pill[^"]*"[^>]*data-img=")[^"]+("[^>]*>\\s*${escSize(size)}\\s*</span>)`
  );
  if (!re.test(html)) return html;
  return html.replace(re, `$1${newImg}$2`);
}

const visible = products.filter((p) => p.visible && p.warehouse === 'US Warehouse');
const missing = [];
const mismatches = [];
const fixes = [];

for (const product of visible) {
  const seen = new Set();
  for (const size of product.vialSizes || []) {
    if (seen.has(size)) continue;
    seen.add(size);
    const expected = lookupCatNo(product, size);
    const current = path.basename((_sizeImages[product.id] || {})[size] || '', '.png') || '';
    if (!expected) {
      missing.push({ name: product.name, size, current });
      continue;
    }
    if (current !== expected) {
      mismatches.push({ name: product.name, size, current, expected });
      fixes.push({ productId: product.id, size, catNo: expected });
    }
  }
}

console.log('Mismatches:', mismatches.length);
mismatches.forEach((m) => console.log(`  ${m.name} ${m.size}: ${m.current || '(none)'} -> ${m.expected}`));
if (missing.length) {
  console.log('Missing:', missing.length);
  missing.forEach((m) => console.log(`  ${m.name} ${m.size}`));
}

if (process.argv.includes('--apply')) {
  for (const fix of fixes) {
    const { productId, size, catNo } = fix;
    if (!_sizeImages[productId]) _sizeImages[productId] = {};
    _sizeImages[productId][size] = `images/vials/${catNo}.png`;
    if (CARD_INNER_HTML[productId]) {
      CARD_INNER_HTML[productId] = fixCardPillImage(CARD_INNER_HTML[productId], size, catNo);
    }
    const product = products.find((p) => p.id === productId);
    if (product) {
      product.catalogNos = product.catalogNos || {};
      product.vialImages = product.vialImages || {};
      product.catalogNos[size] = catNo;
      product.vialImages[size] = `/images/vials/${catNo}.png`;
    }
  }
  const newBlock =
    cardPrefix +
    JSON.stringify(CARD_INNER_HTML) +
    sizePrefix +
    JSON.stringify(_sizeImages) +
    ';\r\n';
  fs.writeFileSync(
    path.join(root, 'index.html'),
    indexHtml.slice(0, cardStart) + newBlock + indexHtml.slice(sizeEnd + 3),
    'utf8'
  );
  fs.writeFileSync(path.join(root, 'products.json'), JSON.stringify(products, null, 2) + '\n', 'utf8');
  console.log('Applied', fixes.length, 'fixes');
}
