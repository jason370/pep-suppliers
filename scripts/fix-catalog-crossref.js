/**
 * Align vial image paths / catalog numbers with price-compare.json cross-reference.
 * BB* = BPC+TB blend; BC* = standalone BPC-157; IP* = Ipamorelin; CP* = CJC+Ip blend; TR* = Tirzepatide.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const productsPath = path.join(root, 'products.json');

const CATALOG_FIXES = {
  'bpc-157-overseas-warehouse': { '10mg': 'BC10', '20mg': 'BC20' },
  'ipamorelin-overseas-warehouse': { '10mg': 'IP10' },
  'tirzepatide-overseas-warehouse': { '80mg': 'TR80', '90mg': 'TR90', '100mg': 'TR100' },
};

let indexHtml = fs.readFileSync(indexPath, 'utf8');
const cardPrefix = '  var CARD_INNER_HTML = ';
const sizePrefix = ';\r\n  window._sizeImages = ';
const cardStart = indexHtml.indexOf(cardPrefix);
const sizeStart = indexHtml.indexOf(sizePrefix, cardStart);
if (cardStart === -1 || sizeStart === -1) throw new Error('Could not locate catalog blocks in index.html');

const cardJsonText = indexHtml.slice(cardStart + cardPrefix.length, sizeStart);
const sizeJsonStart = sizeStart + sizePrefix.length;
const sizeEnd = indexHtml.indexOf(';\r\n', sizeJsonStart);
if (sizeEnd === -1) throw new Error('Could not locate end of _sizeImages block');

const CARD_INNER_HTML = JSON.parse(cardJsonText);
const _sizeImages = JSON.parse(indexHtml.slice(sizeJsonStart, sizeEnd));
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

function escSize(size) {
  return size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fixCardPillImage(html, size, catNo) {
  const newImg = `images/vials/${catNo}.png`;
  const re = new RegExp(
    `(<span class="size-pill[^"]*"[^>]*data-img=")[^"]+("[^>]*>\\s*${escSize(size)}\\s*</span>)`
  );
  if (!re.test(html)) {
    console.warn('Could not patch card pill for size', size);
    return html;
  }
  return html.replace(re, `$1${newImg}$2`);
}

let fixCount = 0;
for (const [productId, sizes] of Object.entries(CATALOG_FIXES)) {
  if (!_sizeImages[productId]) {
    console.warn('Missing _sizeImages entry:', productId);
    continue;
  }
  for (const [size, catNo] of Object.entries(sizes)) {
    _sizeImages[productId][size] = `images/vials/${catNo}.png`;
    if (CARD_INNER_HTML[productId]) {
      CARD_INNER_HTML[productId] = fixCardPillImage(CARD_INNER_HTML[productId], size, catNo);
    }
    fixCount++;
  }
}

for (const product of products) {
  const fixes = CATALOG_FIXES[product.id];
  if (!fixes) continue;
  product.catalogNos = product.catalogNos || {};
  product.vialImages = product.vialImages || {};
  for (const [size, catNo] of Object.entries(fixes)) {
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
indexHtml =
  indexHtml.slice(0, cardStart) + newBlock + indexHtml.slice(sizeEnd + 3);

fs.writeFileSync(indexPath, indexHtml, 'utf8');
fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + '\n', 'utf8');
console.log('Applied', fixCount, 'catalog cross-reference fixes');
console.log('index.html size', fs.statSync(indexPath).size);
