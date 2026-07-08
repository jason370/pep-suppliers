/**
 * Import c:\Users\Jason\OneDrive\Desktop\Peptide Price List.pdf (+ .html)
 * into site US Warehouse price list files. Does not modify the source files.
 */
const fs = require('fs');
const path = require('path');

const SOURCE_HTML = 'C:\\Users\\Jason\\OneDrive\\Desktop\\Peptide Price List.html';
const SOURCE_PDF = 'C:\\Users\\Jason\\OneDrive\\Desktop\\Peptide Price List.pdf';
const root = path.join(__dirname, '..');
const OUT_HTML = path.join(root, 'pep-suppliers-us-warehouse-price-list.html');
const OUT_PDF = path.join(root, 'pep-suppliers-us-warehouse-price-list.pdf');

const src = fs.readFileSync(SOURCE_HTML, 'utf8');
const rowRe =
  /<tr>\s*<td>([^<]*)<\/td>\s*<td class="size">([^<]*)<\/td>\s*<td class="price">([^<]*)<\/td>\s*<td class="price">[^<]*<\/td>\s*<\/tr>/gi;

const rows = [];
let m;
while ((m = rowRe.exec(src))) {
  rows.push({
    product: m[1].trim(),
    size: m[2].trim(),
    price: m[3].trim(),
  });
}

if (!rows.length) {
  console.error('No rows parsed from', SOURCE_HTML);
  process.exit(1);
}

const bodyRows = rows
  .map(
    (r) => `      <tr>
        <td>${r.product.replace(/&/g, '&amp;')}</td>
        <td class="size">${r.size}</td>
        <td class="price">${r.price}</td>
      </tr>`
  )
  .join('\n');

const html = `<!DOCTYPE html>
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
  td.size, th.size { text-align: center; white-space: nowrap; }
  col.c-product { width: 50%; }
  col.c-size { width: 15%; }
  col.c-price { width: 35%; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h1>Pep-Suppliers US Warehouse</h1>
  <div class="sub">Product · Size · Price (Single Vial) · ${rows.length} items · Research use only</div>
  <table>
    <colgroup>
      <col class="c-product"><col class="c-size"><col class="c-price">
    </colgroup>
    <thead>
      <tr>
        <th>Product</th>
        <th class="size">Size</th>
        <th class="price">Price (Single Vial)</th>
      </tr>
    </thead>
    <tbody>
${bodyRows}
    </tbody>
  </table>
</body>
</html>
`;

fs.writeFileSync(OUT_HTML, html, 'utf8');
fs.copyFileSync(SOURCE_PDF, OUT_PDF);
console.log(`Imported ${rows.length} rows from Peptide Price List`);
console.log('Wrote', OUT_HTML);
console.log('Wrote', OUT_PDF);
