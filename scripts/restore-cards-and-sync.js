/**
 * Restore clean CARD_INNER_HTML from f892864, sync products.json from price list only.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');

function extractBlock(html) {
  const cardPrefix = '  var CARD_INNER_HTML = ';
  const sizeMarkers = [';\r\n  window._sizeImages = ', ';\n  window._sizeImages = '];
  const cardStart = html.indexOf(cardPrefix);
  let sizeStart = -1;
  let sizePrefix = '';
  for (const marker of sizeMarkers) {
    const pos = html.indexOf(marker, cardStart);
    if (pos >= 0) {
      sizeStart = pos;
      sizePrefix = marker;
      break;
    }
  }
  if (sizeStart < 0) throw new Error('CARD block not found');
  const cards = JSON.parse(html.slice(cardStart + cardPrefix.length, sizeStart));
  const sizeJsonStart = sizeStart + sizePrefix.length;
  let sizeEnd = html.indexOf(';\r\n', sizeJsonStart);
  if (sizeEnd < 0) sizeEnd = html.indexOf(';\n', sizeJsonStart);
  const sizeImages = JSON.parse(html.slice(sizeJsonStart, sizeEnd));
  return { cardStart, sizeEnd, cardPrefix, sizePrefix, cards, sizeImages, lineTerm: sizePrefix.slice(0, sizePrefix.indexOf('window')) };
}

const oldHtml = execSync('git show f892864:index.html', { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const old = extractBlock(oldHtml);
const curHtml = fs.readFileSync(indexPath, 'utf8');
const cur = extractBlock(curHtml);

let corrupt = 0;
for (const html of Object.values(cur.cards)) {
  if (html && (html.includes('data-price="<') || html.includes('data-price="</div>'))) corrupt++;
}
console.log('Corrupted cards before restore:', corrupt);

const restored =
  curHtml.slice(0, cur.cardStart) +
  cur.cardPrefix +
  JSON.stringify(old.cards) +
  cur.sizePrefix +
  JSON.stringify(cur.sizeImages) +
  cur.lineTerm +
  curHtml.slice(cur.sizeEnd + cur.lineTerm.length);
fs.writeFileSync(indexPath, restored, 'utf8');
console.log('Restored CARD_INNER_HTML from f892864');

require('./sync-us-prices-from-price-list.js');

const after = extractBlock(fs.readFileSync(indexPath, 'utf8'));
corrupt = 0;
for (const html of Object.values(after.cards)) {
  if (html && (html.includes('data-price="<') || html.includes('data-price="</div>'))) corrupt++;
}
console.log('Corrupted cards after sync:', corrupt);
