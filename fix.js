const fs = require('fs');
const {execSync} = require('child_process');

let h = execSync('git show HEAD:index.html', {maxBuffer: 64*1024*1024}).toString('utf8');
const before = h.length;
console.log('read from git HEAD, chars:', before);

// Extract shared b64
const ci = h.indexOf('CARD_INNER_HTML');
const imgStart = h.indexOf('data:image/png;base64,', ci) + 'data:image/png;base64,'.length;
const imgEnd = h.indexOf('\\"', imgStart);
const VIAL_B64 = h.slice(imgStart, imgEnd);
if (VIAL_B64.length < 1000 || VIAL_B64.length > 100000) {
  console.error('ERROR: bad b64 length:', VIAL_B64.length); process.exit(1);
}
console.log('b64 length:', VIAL_B64.length);

// 1. CSS: add vial-wrap overlay styles
// Image is 125x210px rendered at max-width:96px so scale = 96/125 = 0.768
// Rendered height = 210 * 0.768 = 161px
// Label white area starts ~y=82px in original = 63px rendered
// Name text center ~y=112px original = 86px rendered  
// MG badge center ~y=143px original = 110px rendered
const OLD_CSS = '.product-vial{max-width:96px;height:178px;object-fit:contain;filter:drop-shadow(0 14px 20px rgba(7,24,51,.16))}';
const NEW_CSS =
  '.product-vial{max-width:96px;height:auto;object-fit:contain;filter:drop-shadow(0 14px 20px rgba(7,24,51,.16));display:block}\n' +
  '.vial-wrap{position:relative;display:inline-block;width:96px;line-height:0}\n' +
  '.vial-name-lbl{position:absolute;top:79px;left:50%;transform:translateX(-50%);width:68px;text-align:center;font-family:Arial,sans-serif;font-weight:900;font-size:7.2px;color:#14253e;letter-spacing:0.3px;text-transform:uppercase;line-height:1.2;pointer-events:none}\n' +
  '.vial-mg-lbl{position:absolute;top:108px;left:50%;transform:translateX(-50%);background:#0D6D72;color:#fff;font-family:Arial,sans-serif;font-weight:700;font-size:7px;padding:2px 5px;border-radius:3px;white-space:nowrap;pointer-events:none}';

if (!h.includes(OLD_CSS)) { console.error('ERROR: CSS anchor not found'); process.exit(1); }
h = h.replace(OLD_CSS, NEW_CSS);
console.log('CSS patched');

// 2. Patch renderCard — one vial per card, correct name+mg overlaid
const OLD_RENDER =
  'function renderCard(p){\n' +
  '    var inner = CARD_INNER_HTML[p.id];\n' +
  '    if (!inner) return \'\';\n' +
  '    var attrs = p.dataAttributes || {};\n' +
  '    var attrStr = \' class="product-card expanded-product" data-id="\' + escAttr(p.id) + \'"\';\n' +
  '    Object.keys(attrs).forEach(function(k){\n' +
  '      attrStr += \' \' + k + \'="\' + escAttr(attrs[k]) + \'"\';\n' +
  '    });\n' +
  '    return \'<article\' + attrStr + \'>\' + inner + \'</article>\';\n' +
  '  }';

const NEW_RENDER =
  'var VIAL_SRC="data:image/png;base64,' + VIAL_B64 + '";\n' +
  '  function renderCard(p){\n' +
  '    if(!CARD_INNER_HTML[p.id])return\'\';\n' +
  '    var mg=(p.vialSizes&&p.vialSizes[0])||\'\';\n' +
  '    var vialHTML=\'<div class="vial-wrap"><img class="product-vial" src="\'+VIAL_SRC+\'" alt="\'+escAttr(p.name)+\'"/>\'+\n' +
  '      \'<span class="vial-name-lbl">\'+escAttr(p.name.toUpperCase())+\'</span>\'+\n' +
  '      (mg?\'<span class="vial-mg-lbl">\'+escAttr(mg)+\'</span>\':\'\')+\n' +
  '      \'</div>\';\n' +
  '    var rest=CARD_INNER_HTML[p.id].replace(/<div class=\\"product-image-wrap\\">[\\s\\S]*?<\\/div>/,\'\');\n' +
  '    var attrs=p.dataAttributes||{};\n' +
  '    var attrStr=\' class="product-card expanded-product" data-id="\'+escAttr(p.id)+\'"\';\n' +
  '    Object.keys(attrs).forEach(function(k){attrStr+=\' \'+k+\'="\'+escAttr(attrs[k])+\'"\'});\n' +
  '    return\'<article\'+attrStr+\'><div class="product-image-wrap">\'+vialHTML+\'</div>\'+rest+\'</article>\';\n' +
  '  }';

if (!h.includes(OLD_RENDER)) { console.error('ERROR: OLD renderCard not found'); process.exit(1); }
h = h.replace(OLD_RENDER, NEW_RENDER);
console.log('renderCard patched');

fs.writeFileSync('index.html', h, 'utf8');
console.log('before:', before, '-> after:', h.length, '| diff:', h.length - before);
