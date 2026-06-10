const fs = require('fs');
const {execSync} = require('child_process');

let h = execSync('git show HEAD:index.html', {maxBuffer: 64*1024*1024}).toString('utf8');
const before = h.length;
console.log('read from git HEAD, chars:', before);

// Extract the shared base64 vial image from CARD_INNER_HTML
// The b64 ends with \" (escaped quote inside JS string literal in the HTML)
const ci = h.indexOf('CARD_INNER_HTML');
const imgTag = 'data:image/png;base64,';
const imgStart = h.indexOf(imgTag, ci) + imgTag.length;
// b64 terminates at \" which appears as \\" in the raw file
const imgEnd = h.indexOf('\\"', imgStart);
const VIAL_B64 = h.slice(imgStart, imgEnd);
console.log('extracted vial b64, length:', VIAL_B64.length);
if (VIAL_B64.length < 1000 || VIAL_B64.length > 100000) {
  console.error('ERROR: unexpected b64 length:', VIAL_B64.length);
  process.exit(1);
}

// 1. Add CSS for vial overlay
const OLD_CSS = '.product-vial{max-width:96px;height:178px;object-fit:contain;filter:drop-shadow(0 14px 20px rgba(7,24,51,.16))}';
const NEW_CSS =
  '.product-vial{max-width:96px;height:178px;object-fit:contain;filter:drop-shadow(0 14px 20px rgba(7,24,51,.16))}\n' +
  '.vial-wrap{position:relative;display:inline-block;width:96px}\n' +
  '.vial-label{position:absolute;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;width:72px}\n' +
  '.vial-name{top:53%;font-family:Arial,sans-serif;font-weight:900;font-size:8px;color:#14253e;letter-spacing:0.2px;text-transform:uppercase;line-height:1.15}\n' +
  '.vial-mg{top:70%;background:#0D6D72;color:#fff;font-family:Arial,sans-serif;font-weight:700;font-size:7.5px;padding:2px 6px;border-radius:3px;white-space:nowrap;width:auto}';
if (!h.includes(OLD_CSS)) { console.error('ERROR: product-vial CSS not found'); process.exit(1); }
h = h.replace(OLD_CSS, NEW_CSS);
console.log('CSS patched');

// 2. Patch renderCard to overlay name+mg on the shared vial photo
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
  'var VIAL_SRC = \'data:image/png;base64,' + VIAL_B64 + '\';\n' +
  '  function makeVial(name, mgVal){\n' +
  '    return \'<div class="vial-wrap"><img class="product-vial" src="\' + VIAL_SRC + \'" alt="\' + escAttr(name) + \'" />\' +\n' +
  '      \'<span class="vial-label vial-name">\' + escAttr(name.toUpperCase()) + \'</span>\' +\n' +
  '      (mgVal ? \'<span class="vial-label vial-mg">\' + escAttr(mgVal) + \'</span>\' : \'\') +\n' +
  '      \'</div>\';\n' +
  '  }\n' +
  '  function renderCard(p){\n' +
  '    if (!CARD_INNER_HTML[p.id]) return \'\';\n' +
  '    var sizes = p.vialSizes || [];\n' +
  '    var mg = sizes[0] || \'\';\n' +
  '    var mg2 = sizes[1] || \'\';\n' +
  '    var imageHTML = \'<div class="product-image-wrap">\' + makeVial(p.name, mg) + (mg2 ? makeVial(p.name, mg2) : \'\') + \'</div>\';\n' +
  '    var rest = CARD_INNER_HTML[p.id].replace(/<div class=\\"product-image-wrap\\">[\\s\\S]*?<\\/div>/, \'\');\n' +
  '    var attrs = p.dataAttributes || {};\n' +
  '    var attrStr = \' class="product-card expanded-product" data-id="\' + escAttr(p.id) + \'"\';\n' +
  '    Object.keys(attrs).forEach(function(k){ attrStr += \' \' + k + \'="\' + escAttr(attrs[k]) + \'"\'; });\n' +
  '    return \'<article\' + attrStr + \'>\' + imageHTML + rest + \'</article>\';\n' +
  '  }';

if (!h.includes(OLD_RENDER)) { console.error('ERROR: OLD renderCard not found'); process.exit(1); }
h = h.replace(OLD_RENDER, NEW_RENDER);
console.log('renderCard patched');

fs.writeFileSync('index.html', h, 'utf8');
console.log('before:', before, '-> after:', h.length, '| diff:', h.length - before);
