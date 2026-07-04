const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const products = JSON.parse(fs.readFileSync(path.join(root, 'products.json'), 'utf8')).filter(
  (p) => p.visible && p.warehouse === 'US Warehouse'
);
const productsById = Object.fromEntries(products.map((p) => [p.id, p]));

const cardMatch = indexHtml.match(/var CARD_INNER_HTML = (\{[\s\S]*?\});\s*\n\s*window\._sizeImages/);
const sizeMatch = indexHtml.match(/window\._sizeImages = (\{[\s\S]*?\});\s*\n/);
if (!cardMatch || !sizeMatch) {
  console.error('Could not parse CARD_INNER_HTML or _sizeImages from index.html');
  process.exit(1);
}

const CARD_INNER_HTML = JSON.parse(cardMatch[1]);
const _sizeImages = JSON.parse(sizeMatch[1]);

function catalogNo(productId, size) {
  const product = productsById[productId];
  if (product && product.catalogNos && product.catalogNos[size]) {
    return product.catalogNos[size];
  }
  const img = ((_sizeImages[productId] || {})[size] || '').replace(/\\/g, '/');
  const base = path.basename(img, '.png');
  return base || '—';
}

function cardPriceForSize(html, size) {
  if (!html) return '';
  for (const m of html.matchAll(/<span class="size-pill[^"]*"[^>]*>([^<]+)<\/span>/g)) {
    if (m[1].trim() !== size) continue;
    const idx = m.index;
    const tagStart = html.lastIndexOf('<span', idx);
    const tagEnd = html.indexOf('</span>', idx) + 7;
    const tag = html.slice(tagStart, tagEnd);
    const priceMatch = tag.match(/data-price="([^"]*)"/);
    if (priceMatch && priceMatch[1]) return priceMatch[1].trim();
  }
  return '';
}

const rows = [];
for (const product of products) {
  const html = CARD_INNER_HTML[product.id] || '';
  const seenSizes = new Set();
  for (const size of product.vialSizes || []) {
    if (seenSizes.has(size)) continue;
    seenSizes.add(size);
    const cardPrice = cardPriceForSize(html, size);
    const jsonPrice = (product.prices && product.prices[size]) || '';
    const price = cardPrice || jsonPrice || 'Contact for price';
    rows.push({
      product: product.name,
      size,
      no: catalogNo(product.id, size),
      price,
    });
  }
}

rows.sort((a, b) => {
  const byName = a.product.localeCompare(b.product, undefined, { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return a.size.localeCompare(b.size, undefined, { numeric: true });
});

const seenNos = new Set();
const dupNos = [];
for (const row of rows) {
  if (seenNos.has(row.no)) dupNos.push(row.no);
  seenNos.add(row.no);
}

const htmlOut = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pep-Suppliers US Warehouse Price List</title>
<style>
  @page { size: letter landscape; margin: 0.45in 0.4in; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 9.5pt; }
  h1 { font-size: 16pt; margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub { color: #555; font-size: 9pt; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th, td { border: 0.5px solid #cbd5e1; padding: 5px 7px; vertical-align: top; word-wrap: break-word; }
  th { background: #0f766e; color: #fff; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  td.price, th.price { text-align: right; white-space: nowrap; }
  col.c-product { width: 32%; }
  col.c-size { width: 10%; }
  col.c-no { width: 12%; }
  col.c-price { width: 12%; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h1>Pep-Suppliers US Warehouse</h1>
  <div class="sub">Product · Size · Catalog No · Sale Price · ${rows.length} items · Research use only · Generated from live catalog</div>
  <table>
    <colgroup>
      <col class="c-product"><col class="c-size"><col class="c-no"><col class="c-price">
    </colgroup>
    <thead>
      <tr>
        <th>Product</th>
        <th>Size</th>
        <th>No</th>
        <th class="price">Sale Price</th>
      </tr>
    </thead>
    <tbody>
${rows
  .map(
    (row) => `      <tr>
        <td>${row.product.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>
        <td>${row.size}</td>
        <td>${row.no}</td>
        <td class="price">${row.price}</td>
      </tr>`
  )
  .join('\n')}
    </tbody>
  </table>
</body>
</html>
`;

const outHtml = path.join(root, 'pep-suppliers-us-warehouse-price-list.html');
fs.writeFileSync(outHtml, htmlOut, 'utf8');
console.log('Wrote', outHtml, 'rows:', rows.length);
if (dupNos.length) {
  console.warn('Duplicate catalog numbers (shared vial codes):', [...new Set(dupNos)].join(', '));
}

async function writePdf() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    try {
      ({ chromium } = require('C:/TMP-Cursor-v0-git/node_modules/playwright'));
    } catch (e2) {
      console.warn('Playwright not available; HTML only. Install playwright to regenerate PDF.');
      return;
    }
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///' + outHtml.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  const outPdf = path.join(root, 'pep-suppliers-us-warehouse-price-list.pdf');
  await page.pdf({
    path: outPdf,
    format: 'Letter',
    landscape: true,
    printBackground: true,
    margin: { top: '0.45in', right: '0.4in', bottom: '0.45in', left: '0.4in' },
  });
  await browser.close();
  console.log('Wrote', outPdf);
}

writePdf().catch((err) => {
  console.error('PDF generation failed:', err.message);
  process.exitCode = 1;
});
