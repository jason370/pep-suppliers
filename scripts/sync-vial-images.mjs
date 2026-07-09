/**
 * Sync products.json vialImages from index.html window._sizeImages
 * and align image paths with vials master composites (/images/vials/*.png).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const match = html.match(/window\._sizeImages = (\{[\s\S]*?\});/);
if (!match) throw new Error('window._sizeImages not found in index.html');

const sizeImages = JSON.parse(match[1]);
const productsPath = path.join(ROOT, 'products.json');
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

let updated = 0;
for (const product of products) {
  const map = sizeImages[product.id];
  if (!map) continue;

  const vialImages = {};
  for (const [size, relPath] of Object.entries(map)) {
    const normalized = relPath.startsWith('/') ? relPath : '/' + relPath.replace(/^\/?/, '');
    vialImages[size] = normalized.startsWith('/images/') ? normalized : '/images/vials/' + path.basename(relPath);
  }

  const prev = JSON.stringify(product.vialImages || null);
  const next = JSON.stringify(vialImages);
  if (prev !== next) {
    product.vialImages = vialImages;
    updated++;
  }
}

// US 5-amino entry: use full composites when master art exists
const us5am = products.find((p) => p.id === '5-amino-1mq-overseas-warehouse');
if (us5am) {
  us5am.vialImages = {
    '5mg': '/images/vials/5AM.png',
    '10mg': '/images/vials/10AM.png',
    '50mg': '/images/vials/50AM.png',
  };
  updated++;
}

fs.writeFileSync(productsPath, JSON.stringify(products, null, 2) + '\n');
console.log('Updated vialImages on', updated, 'products');
console.log('Products with vialImages:', products.filter((p) => p.vialImages).length);
