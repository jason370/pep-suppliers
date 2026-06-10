const fs = require('fs');
const {execSync} = require('child_process');

let h = execSync('git show HEAD:index.html', {maxBuffer: 64*1024*1024}).toString('utf8');
const before = h.length;
console.log('read from git HEAD, chars:', before);

// Find the broken vialSVG+renderCard block by character position and replace it entirely
const blockStart = h.indexOf('function vialSVG');
const blockEnd = h.indexOf("document.addEventListener('DOMContentLoaded'", blockStart);
if (blockStart === -1 || blockEnd === -1) {
  console.error('ERROR: Could not locate vialSVG block');
  process.exit(1);
}
console.log('Found vialSVG block at chars', blockStart, '-', blockEnd);

const FIXED_BLOCK =
  'function vialSVG(name, mg){\n' +
  '    var shortName = name.length > 13 ? name.substring(0,12)+\'\\u2026\' : name;\n' +
  '    var words = shortName.toUpperCase().split(\' \');\n' +
  '    var lines = [], line = \'\';\n' +
  '    words.forEach(function(w){\n' +
  '      if((line+\' \'+w).trim().length > 9 && line){ lines.push(line.trim()); line=w; }\n' +
  '      else { line=(line+\' \'+w).trim(); }\n' +
  '    });\n' +
  '    if(line) lines.push(line.trim());\n' +
  '    var nameY = lines.length===1 ? 105 : 98;\n' +
  '    var mgId = mg.replace(/[^a-z0-9]/gi,\'\');\n' +
  '    var nameSVG = lines.map(function(l,i){\n' +
  '      return \'<text x="36" y="\'+(nameY+i*13)+\'" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="8.5" fill="#14253e" letter-spacing="0.3">\'+l+\'</text>\';\n' +
  '    }).join(\'\');\n' +
  '    return \'<svg class="card-vial-svg" width="68" height="155" viewBox="0 0 68 155" xmlns="http://www.w3.org/2000/svg">\'\n' +
  '      +\'<defs>\'\n' +
  '      +\'<linearGradient id="vg\'+mgId+\'x" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#8aa0b8"/><stop offset="45%" stop-color="#d8e4ee"/><stop offset="100%" stop-color="#8aa0b8"/></linearGradient>\'\n' +
  '      +\'<linearGradient id="gl\'+mgId+\'x" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#6cc6c9" stop-opacity="0.15"/><stop offset="40%" stop-color="#fff" stop-opacity="0.5"/><stop offset="100%" stop-color="#6cc6c9" stop-opacity="0.05"/></linearGradient>\'\n' +
  '      +\'</defs>\'\n' +
  '      +\'<rect x="21" y="1" width="26" height="7" rx="3" fill="#1a3a5c"/>\'\n' +
  '      +\'<rect x="17" y="7" width="34" height="12" rx="4" fill="url(#vg\'+mgId+\'x)"/>\'\n' +
  '      +\'<rect x="13" y="18" width="42" height="124" rx="7" fill="#dff0f3" stroke="#b8d8dc" stroke-width="1"/>\'\n' +
  '      +\'<rect x="13" y="18" width="42" height="124" rx="7" fill="url(#gl\'+mgId+\'x)"/>\'\n' +
  '      +\'<rect x="15" y="56" width="38" height="72" rx="4" fill="#fff" stroke="#cde0e3" stroke-width="0.8"/>\'\n' +
  '      +\'<circle cx="23" cy="68" r="5" fill="none" stroke="#0D6D72" stroke-width="1.2"/>\'\n' +
  '      +\'<text x="23" y="71" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="5" fill="#0D6D72">PS</text>\'\n' +
  '      +nameSVG\n' +
  '      +\'<rect x="20" y="119" width="28" height="10" rx="3" fill="#0D6D72"/>\'\n' +
  '      +\'<text x="34" y="127" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="7.5" fill="#fff">\'+mg+\'</text>\'\n' +
  '      +\'</svg>\';\n' +
  '  }\n' +
  '\n' +
  '  function renderCard(p){\n' +
  '    var sizes = p.vialSizes || [\'?\'];\n' +
  '    var vialsHTML = sizes.length===1 ? vialSVG(p.name, sizes[0]) : vialSVG(p.name, sizes[0]) + vialSVG(p.name, sizes[1]);\n' +
  '    var sizePills = sizes.map(function(s,i){ return \'<span class="size-pill\'+(i===0?\' active\':\'\')+\'">\'+s+\'</span>\'; }).join(\'\');\n' +
  '    var priceStr = p.price ? String(p.price).replace(/[^0-9.]/g,\'\') : \'\';\n' +
  '    var priceDisplay = priceStr ? \'$\'+Number(priceStr).toFixed(2) : \'&#8212;\';\n' +
  '    var attrs = p.dataAttributes || {};\n' +
  '    var attrStr = \' class="product-card expanded-product" data-id="\' + escAttr(p.id) + \'"\';\n' +
  '    Object.keys(attrs).forEach(function(k){ attrStr += \' \' + k + \'="\' + escAttr(attrs[k]) + \'"\'; });\n' +
  '    var inner = \'<div class="card-vials">\' + vialsHTML + \'</div>\' + \'<div class="product-info">\' + \'<h3>\' + escAttr(p.name) + \'</h3>\' + \'<p class="product-sub">Research Use Only</p>\' + \'<div class="size-options"><span class="size-label">MG per vial</span><div class="size-pills">\' + sizePills + \'</div></div>\' + \'<div class="tier-preview"><div class="tier-box"><strong>5&#8211;8 units</strong><span>10% off</span></div><div class="tier-box"><strong>9+ units</strong><span>15% off</span></div></div>\' + \'<div class="product-divider"></div>\' + \'<p class="starting">Pep Suppliers price</p>\' + \'<p class="price">\' + priceDisplay + \'</p>\' + \'<p class="reference-note">60% below listed reference price</p>\' + \'<div class="card-actions"><button class="bookmark" type="button" aria-label="Save \' + escAttr(p.name) + \'">&#9825;</button><a class="view-options" href="#contact">View options</a></div>\' + \'</div>\';\n' +
  '    return \'<article\' + attrStr + \'>\' + inner + \'</article>\';\n' +
  '  }\n' +
  '\n  ';

h = h.slice(0, blockStart) + FIXED_BLOCK + h.slice(blockEnd);

// Verify JS parses
const idx = h.indexOf('function vialSVG');
const end2 = h.indexOf('document.addEventListener', idx);
try {
  new Function('escAttr', h.slice(idx, end2) + '; return typeof renderCard;')(function(s){return s;});
  console.log('JS syntax OK');
} catch(e) {
  console.error('JS SYNTAX ERROR:', e.message);
  process.exit(1);
}

fs.writeFileSync('index.html', h, 'utf8');
console.log('before:', before, '-> after:', h.length, '| diff:', h.length - before);
