/**
 * Import Desktop Peptide Price List.pdf + .html into site price list files.
 * Copies the source exactly (4 columns: Product, Size, US vial, China kit).
 */
const fs = require('fs');
const path = require('path');

const SOURCE_HTML = 'C:\\Users\\Jason\\OneDrive\\Desktop\\Peptide Price List.html';
const SOURCE_PDF = 'C:\\Users\\Jason\\OneDrive\\Desktop\\Peptide Price List.pdf';
const root = path.join(__dirname, '..');
const OUT_HTML = path.join(root, 'pep-suppliers-us-warehouse-price-list.html');
const OUT_PDF = path.join(root, 'pep-suppliers-us-warehouse-price-list.pdf');

let html = fs.readFileSync(SOURCE_HTML, 'utf8');
if (!/name="viewport"/i.test(html)) {
  html = html.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1">');
}

const rowRe =
  /<tr>\s*<td>([^<]*)<\/td>\s*<td class="size">([^<]*)<\/td>\s*<td class="price">([^<]*)<\/td>\s*<td class="price">([^<]*)<\/td>\s*<\/tr>/gi;
let rows = 0;
let m;
while ((m = rowRe.exec(html))) rows++;

if (!rows) {
  console.error('No rows parsed from', SOURCE_HTML);
  process.exit(1);
}

fs.writeFileSync(OUT_HTML, html, 'utf8');
fs.copyFileSync(SOURCE_PDF, OUT_PDF);
console.log(`Imported ${rows} rows from Peptide Price List (full 4-column format)`);
console.log('Wrote', OUT_HTML);
console.log('Wrote', OUT_PDF);
