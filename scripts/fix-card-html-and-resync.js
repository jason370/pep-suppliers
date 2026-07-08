/**
 * Restore CARD_INNER_HTML from git (pre-corruption), fix sync replace bug, re-sync prices.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'index.html');

function extractCards(html) {
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
  if (sizeStart < 0) throw new Error('CARD_INNER_HTML block not found');
  const cards = JSON.parse(html.slice(cardStart + cardPrefix.length, sizeStart));
  const sizeJsonStart = sizeStart + sizePrefix.length;
  let sizeEnd = html.indexOf(';\r\n', sizeJsonStart);
  if (sizeEnd < 0) sizeEnd = html.indexOf(';\n', sizeJsonStart);
  const sizeImages = JSON.parse(html.slice(sizeJsonStart, sizeEnd));
  return { cardStart, sizeEnd, cardPrefix, sizePrefix, cards, sizeImages, lineTerm: sizePrefix.slice(0, sizePrefix.indexOf('window')) };
}

// Restore cards from parent commit (before corrupted sync)
const oldHtml = execSync('git show f892864:index.html', { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const old = extractCards(oldHtml);
const currentHtml = fs.readFileSync(indexPath, 'utf8');
const cur = extractCards(currentHtml);

let corrupted = 0;
for (const [id, html] of Object.entries(cur.cards)) {
  if (html && html.includes('data-price="<span')) corrupted++;
}

console.log(`Corrupted cards before fix: ${corrupted}`);

// Merge: use old card HTML structure, keep current file around it
const newHtml =
  currentHtml.slice(0, cur.cardStart) +
  cur.cardPrefix +
  JSON.stringify(old.cards) +
  cur.sizePrefix +
  JSON.stringify(cur.sizeImages) +
  cur.lineTerm +
  currentHtml.slice(cur.sizeEnd + cur.lineTerm.length);

fs.writeFileSync(indexPath, newHtml, 'utf8');
console.log('Restored CARD_INNER_HTML from f892864');

// Fix sync script replace bug then run it
const syncPath = path.join(__dirname, 'sync-us-prices-from-price-list.js');
let sync = fs.readFileSync(syncPath, 'utf8');
const buggy = 'out = out.replace(pricePat, `$1${price}$2`);';
const fixed = 'out = out.replace(pricePat, (_, a, b) => a + price + b);';
if (sync.includes(buggy)) {
  sync = sync.replace(buggy, fixed);
  const buggy2 = 'if (addPat.test(out)) out = out.replace(addPat, `$1 data-price="${price}"$2`);';
  const fixed2 = 'if (addPat.test(out)) out = out.replace(addPat, (_, a, b) => `${a} data-price="${price}"${b}`);';
  sync = sync.replace(buggy2, fixed2);
  fs.writeFileSync(syncPath, sync, 'utf8');
  console.log('Fixed $13 replace bug in sync script');
}

require('./sync-us-prices-from-price-list.js');

// Verify no corruption
const after = extractCards(fs.readFileSync(indexPath, 'utf8'));
let bad = 0;
for (const html of Object.values(after.cards)) {
  if (html && html.includes('data-price="<span')) bad++;
}
console.log(`Corrupted cards after fix: ${bad}`);
const sample = after.cards['5-amino-1mq-overseas-warehouse'];
if (sample) {
  const prices = [...sample.matchAll(/data-price="(\$[^"]+)"/g)].map((m) => m[1]);
  console.log('5-Amino pill prices:', prices.join(', '));
}
