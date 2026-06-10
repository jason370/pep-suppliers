const fs = require('fs');
const {execSync} = require('child_process');

let h = execSync('git show HEAD:index.html', {maxBuffer: 64*1024*1024}).toString('utf8');
const before = h.length;
console.log('read from git HEAD, chars:', before);

// Kill Tawk "Hi Jason" bubble with aggressive hide loop + CSS nuke
const OLD_TAWK =
  'Tawk_LoadStart=new Date();\n' +
  'Tawk_API.onLoad=function(){ Tawk_API.hideWidget(); };\n' +
  '(function(){';

const NEW_TAWK =
  'Tawk_LoadStart=new Date();\n' +
  'Tawk_API.onLoad=function(){\n' +
  '  Tawk_API.hideWidget();\n' +
  '  var _hc=0,_hi=setInterval(function(){\n' +
  '    if(Tawk_API&&Tawk_API.hideWidget)Tawk_API.hideWidget();\n' +
  '    if(++_hc>=20)clearInterval(_hi);\n' +
  '  },300);\n' +
  '};\n' +
  'Tawk_API.onChatMaximized=function(){ Tawk_API.hideWidget(); };\n' +
  '(function(){';

const replaced = h.replace(OLD_TAWK, NEW_TAWK);
if (replaced === h) { console.error('ERROR: Tawk block not found'); process.exit(1); }
h = replaced;
console.log('Tawk block patched');

// Also inject CSS to nuke any Tawk iframe/widget that slips through
const CSS_INJECT = '\n<style>body > div[id^="tawk-"],body > div[class*="tawk-"]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}iframe[src*="tawk.to"]{display:none!important}</style>\n';
h = h.replace('<!--End of Tawk.to Script-->', '<!--End of Tawk.to Script-->' + CSS_INJECT);

fs.writeFileSync('index.html', h, 'utf8');
console.log('before:', before, '-> after:', h.length, '| diff:', h.length - before);
