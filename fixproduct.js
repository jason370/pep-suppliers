const fs = require('fs');
const {execSync} = require('child_process');

let h = execSync('git show HEAD:product.html', {maxBuffer: 64*1024*1024}).toString('utf8');
const before = h.length;
console.log('read from git HEAD, chars:', before);

// Replace cartoon SVG vial with real branded photo
h = h.replace(
  `<div class="product-visual" aria-hidden="true">
          <svg viewBox="0 0 120 200" fill="none" xmlns="http://www.w3.org/2000/svg" width="180" height="240">
            <!-- cap -->
            <rect x="36" y="6" width="48" height="16" rx="5" fill="#0D6D72"/>
            <!-- neck -->
            <rect x="44" y="22" width="32" height="8" rx="2" fill="#6CC6C9"/>
            <!-- body -->
            <rect x="26" y="30" width="68" height="128" rx="8" fill="#EEF8FA" stroke="#0D6D72" stroke-width="2"/>
            <!-- label -->
            <rect x="34" y="48" width="52" height="72" rx="5" fill="#fff" stroke="#b8dde0" stroke-width="1"/>
            <rect x="40" y="58" width="40" height="3" rx="1.5" fill="#6CC6C9" opacity=".8"/>
            <rect x="40" y="68" width="30" height="3" rx="1.5" fill="#6CC6C9" opacity=".6"/>
            <rect x="40" y="78" width="34" height="3" rx="1.5" fill="#6CC6C9" opacity=".6"/>
            <rect x="40" y="88" width="22" height="3" rx="1.5" fill="#6CC6C9" opacity=".4"/>
            <rect x="40" y="100" width="28" height="3" rx="1.5" fill="#0D6D72" opacity=".3"/>
            <!-- liquid fill -->
            <rect x="27" y="110" width="66" height="47" rx="0 0 7 7" fill="#6CC6C9" opacity=".2"/>
            <!-- shadow -->
            <ellipse cx="60" cy="161" rx="30" ry="5" fill="#0D6D72" opacity=".10"/>
          </svg>
        </div>`,
  `<div class="product-visual" aria-hidden="true">
          <img src="/images/vial-placeholder.jpg" alt="Pep Suppliers vials" style="width:100%;max-width:420px;height:auto;border-radius:12px;object-fit:cover;">
        </div>`
);

fs.writeFileSync('product.html', h, 'utf8');
console.log('before:', before, '-> after:', h.length, '| diff:', h.length - before);
