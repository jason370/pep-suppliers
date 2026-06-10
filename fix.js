const fs = require('fs');
const {execSync} = require('child_process');

let h = execSync('git show HEAD:index.html', {maxBuffer: 64*1024*1024}).toString('utf8');
const before = h.length;
console.log('read from git HEAD, chars:', before);

// 0. Tawk cart attributes (idempotent no-op keep)
// already in HEAD - skip

// 1. Auth0 fallback
h = h.replace(
  '      if (auth0Client) {\n' +
  '        auth0Client.loginWithRedirect({ authorizationParams: { redirect_uri: window.location.origin } });\n' +
  '      } else {\n' +
  '        console.error(\'auth0Client not ready\');\n' +
  '      }',
  '      if (auth0Client) {\n' +
  '        auth0Client.loginWithRedirect({ authorizationParams: { redirect_uri: window.location.origin } });\n' +
  '      } else {\n' +
  '        var base = \'https://pep-suppliers.us.auth0.com/authorize\';\n' +
  '        var params = \'response_type=code\' +\n' +
  '          \'&client_id=l2sUfOUVhy7mYnocVqt08u2J0yHpb4Kr\' +\n' +
  '          \'&redirect_uri=\' + encodeURIComponent(window.location.origin) +\n' +
  '          \'&scope=openid%20profile%20email\';\n' +
  '        window.location.href = base + \'?\' + params;\n' +
  '      }'
);

// 2. Remove duplicate minified script blocks
const dupScript = '<script>window.handleHeaderAuth=function(e){e.preventDefault();if(window.auth0Client){window.auth0Client.loginWithRedirect({authorizationParams:{redirect_uri:window.location.origin}});}};window.handleLogout=function(e){e.preventDefault();if(window.auth0Client){window.auth0Client.logout({logoutParams:{returnTo:window.location.origin}});}};window.handleHeaderAuth=window.handleHeaderAuth;</script>';
while (h.includes(dupScript)) { h = h.replace(dupScript, ''); }

// 3. CSS: header-actions + card-vials
h = h.replace(
  '.account-dropdown a:hover{background:#EEF8FA;color:var(--teal)}',
  '.account-dropdown a:hover{background:#EEF8FA;color:var(--teal)}\n' +
  '.header-actions{display:flex;align-items:center;gap:6px;margin-left:auto}\n' +
  '.hdr-icon-btn{background:none;border:none;cursor:pointer;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#14253e;transition:background .15s}\n' +
  '.hdr-icon-btn:hover{background:#EEF8FA;color:var(--teal)}\n' +
  '.hdr-profile-wrap{position:relative}\n' +
  '.search-bar-wrap{display:none;position:absolute;top:52px;right:0;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:10px 14px;z-index:300;width:280px}\n' +
  '.search-bar-wrap.open{display:flex;gap:8px}\n' +
  '.search-bar-wrap input{flex:1;border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:14px;outline:none}\n' +
  '.search-bar-wrap input:focus{border-color:var(--teal)}\n' +
  '.card-vials{display:flex;gap:6px;justify-content:center;align-items:flex-end;padding:16px 12px 8px;background:#0e1f38;border-radius:12px 12px 0 0;min-height:148px}\n' +
  '.card-vial-svg{flex-shrink:0}'
);

// 5. Tawk hide loop
h = h.replace(
  'var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();\n' +
  'Tawk_API.onLoad=function(){ Tawk_API.hideWidget(); };\n' +
  '(function(){',
  'var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();\n' +
  'Tawk_API.onLoad=function(){\n' +
  '  Tawk_API.hideWidget();\n' +
  '  var _hc=0,_hi=setInterval(function(){\n' +
  '    if(Tawk_API&&Tawk_API.hideWidget)Tawk_API.hideWidget();\n' +
  '    if(++_hc>=10)clearInterval(_hi);\n' +
  '  },500);\n' +
  '};\n' +
  '(function(){'
);

// 6. RC-022: Replace renderCard with dynamic SVG vial generator
var OLD_RENDER = [
  'function renderCard(p){',
  "    var inner = CARD_INNER_HTML[p.id];",
  "    if (!inner) return '';",
  '    var attrs = p.dataAttributes || {};',
  '    var attrStr = \' class="product-card expanded-product" data-id="\' + escAttr(p.id) + \'"\';',
  '    Object.keys(attrs).forEach(function(k){',
  '      attrStr += \' \' + k + \'="\' + escAttr(attrs[k]) + \'"\';',
  '    });',
  "    return '<article' + attrStr + '>' + inner + '</article>';",
  '  }'
].join('\n');

var NEW_RENDER = [
  'function vialSVG(name, mg){',
  '    var shortName = name.length > 13 ? name.substring(0,12)+\'\\u2026\' : name;',
  '    var words = shortName.toUpperCase().split(\' \');',
  '    var lines = [], line = \'\';',
  '    words.forEach(function(w){',
  '      if((line+\' \'+w).trim().length > 9 && line){ lines.push(line.trim()); line=w; }',
  '      else { line=(line+\' \'+w).trim(); }',
  '    });',
  '    if(line) lines.push(line.trim());',
  '    var nameY = lines.length===1 ? 105 : 98;',
  '    var mgId = mg.replace(/[^a-z0-9]/gi,\'\');',
  '    var nameSVG = lines.map(function(l,i){',
  '      return \'<text x="36" y="\'+(nameY+i*13)+\'" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="8.5" fill="#14253e" letter-spacing="0.3">\'+l+\'</text>\';',
  '    }).join(\'\');',
  '    return \'<svg class="card-vial-svg" width="68" height="155" viewBox="0 0 68 155" xmlns="http://www.w3.org/2000/svg">\'',
  '      +\'<defs>\'',
  '      +\'<linearGradient id="vg\'+mgId+\'x" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#8aa0b8"/><stop offset="45%" stop-color="#d8e4ee"/><stop offset="100%" stop-color="#8aa0b8"/></linearGradient>\'',
  '      +\'<linearGradient id="gl\'+mgId+\'x" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#6cc6c9" stop-opacity="0.15"/><stop offset="40%" stop-color="#fff" stop-opacity="0.5"/><stop offset="100%" stop-color="#6cc6c9" stop-opacity="0.05"/></linearGradient>\'',
  '      +\'</defs>\'',
  '      +\'<rect x="21" y="1" width="26" height="7" rx="3" fill="#1a3a5c"/>\'',
  '      +\'<rect x="17" y="7" width="34" height="12" rx="4" fill="url(#vg\'+mgId+\'x)"/>\'',
  '      +\'<rect x="13" y="18" width="42" height="124" rx="7" fill="#dff0f3" stroke="#b8d8dc" stroke-width="1"/>\'',
  '      +\'<rect x="13" y="18" width="42" height="124" rx="7" fill="url(#gl\'+mgId+\'x)"/>\'',
  '      +\'<rect x="15" y="56" width="38" height="72" rx="4" fill="#fff" stroke="#cde0e3" stroke-width="0.8"/>\'',
  '      +\'<circle cx="23" cy="68" r="5" fill="none" stroke="#0D6D72" stroke-width="1.2"/>\'',
  '      +\'<text x="23" y="71" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="5" fill="#0D6D72">PS</text>\'',
  '      +nameSVG',
  '      +\'<rect x="20" y="119" width="28" height="10" rx="3" fill="#0D6D72"/>\'',
  '      +\'<text x="34" y="127" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="7.5" fill="#fff">\'+mg+\'</text>\'',
  '      +\'</svg>\';',
  '  }',
  '',
  '  function renderCard(p){',
  '    var sizes = p.vialSizes || [\'?\'];',
  '    var vialsHTML = sizes.length===1',
  '      ? vialSVG(p.name, sizes[0])',
  '      : vialSVG(p.name, sizes[0]) + vialSVG(p.name, sizes[1]);',
  '    var sizePills = sizes.map(function(s,i){ return \'<span class="size-pill\'+(i===0?\' active\':\'\')+\'">\'+s+\'</span>\'; }).join(\'\');',
  '    var attrs = p.dataAttributes || {};',
  '    var attrStr = \' class="product-card expanded-product" data-id="\' + escAttr(p.id) + \'"\';',
  '    Object.keys(attrs).forEach(function(k){',
  '      attrStr += \' \' + k + \'="\' + escAttr(attrs[k]) + \'"\';',
  '    });',
  '    var inner =',
  '      \'<div class="card-vials">\' + vialsHTML + \'</div>\' +',
  '      \'<div class="product-info">\' +',
  '        \'<h3>\' + escAttr(p.name) + \'</h3>\' +',
  '        \'<p class="product-sub">Research Use Only</p>\' +',
  '        \'<div class="size-options"><span class="size-label">MG per vial</span><div class="size-pills">\' + sizePills + \'</div></div>\' +',
  '        \'<div class="tier-preview"><div class="tier-box"><strong>5&#8211;8 units</strong><span>10% off</span></div><div class="tier-box"><strong>9+ units</strong><span>15% off</span></div></div>\' +',
  '        \'<div class="product-divider"></div>\' +',
  '        \'<p class="starting">Pep Suppliers price</p>\' +',
  '        \'<p class="price">$\' + (p.price ? Number(p.price).toFixed(2) : \'&#8212;\') + \'</p>\' +',
  '        \'<p class="reference-note">60% below listed reference price</p>\' +',
  '        \'<div class="card-actions"><button class="bookmark" type="button" aria-label="Save \' + escAttr(p.name) + \'">&#9825;</button><a class="view-options" href="#contact">View options</a></div>\' +',
  '      \'</div>\';',
  '    return \'<article\' + attrStr + \'>\' + inner + \'</article>\';',
  '  }'
].join('\n');

h = h.replace(OLD_RENDER, NEW_RENDER);

fs.writeFileSync('index.html', h, 'utf8');
console.log('before:', before, '-> after:', h.length, '| diff:', h.length - before);
