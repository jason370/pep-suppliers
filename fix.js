const fs = require('fs');
const {execSync} = require('child_process');

// Always read from git HEAD to avoid stale disk state
let h = execSync('git show HEAD:index.html', {maxBuffer: 64*1024*1024}).toString('utf8');
const before = h.length;
console.log('read from git HEAD, chars:', before);

// 0. Fix cartCheckout: use Tawk visitor attributes so cart shows in your dashboard
h = h.replace(
  `  // Set Tawk visitor attributes so cart shows in your dashboard
  var cartSummary = items.map(function(i){ return i.name + ' ' + i.vialSize + ' x' + i.qty; }).join(', ');
  var doOpen = function() {
    if (window.Tawk_API && window.Tawk_API.setAttributes) {
      window.Tawk_API.setAttributes({ 'cart': cartSummary, 'order': msg }, function(err){});
    }
    if (window.Tawk_API && window.Tawk_API.maximize) {
      window.Tawk_API.maximize();
    }
  };
  if (window.Tawk_API && window.Tawk_API.maximize) {
    doOpen();
  } else {
    window.Tawk_API = window.Tawk_API || {};
    var _origLoad = window.Tawk_API.onLoad;
    window.Tawk_API.onLoad = function() { if (_origLoad) _origLoad(); doOpen(); };
  }`,
  `  // Set Tawk visitor attributes so cart shows in your dashboard
  var cartSummary = items.map(function(i){ return i.name + ' ' + i.vialSize + ' x' + i.qty; }).join(', ');
  var doOpen = function() {
    if (window.Tawk_API && window.Tawk_API.setAttributes) {
      window.Tawk_API.setAttributes({ 'cart': cartSummary, 'order': msg }, function(err){});
    }
    if (window.Tawk_API && window.Tawk_API.maximize) {
      window.Tawk_API.maximize();
    }
  };
  if (window.Tawk_API && window.Tawk_API.maximize) {
    doOpen();
  } else {
    window.Tawk_API = window.Tawk_API || {};
    var _origLoad = window.Tawk_API.onLoad;
    window.Tawk_API.onLoad = function() { if (_origLoad) _origLoad(); doOpen(); };
  }`
);

// 1. Replace the console.error else-branch with direct Auth0 URL fallback
h = h.replace(
  `      if (auth0Client) {
        auth0Client.loginWithRedirect({ authorizationParams: { redirect_uri: window.location.origin } });
      } else {
        console.error('auth0Client not ready');
      }`,
  `      if (auth0Client) {
        auth0Client.loginWithRedirect({ authorizationParams: { redirect_uri: window.location.origin } });
      } else {
        var base = 'https://pep-suppliers.us.auth0.com/authorize';
        var params = 'response_type=code' +
          '&client_id=l2sUfOUVhy7mYnocVqt08u2J0yHpb4Kr' +
          '&redirect_uri=' + encodeURIComponent(window.location.origin) +
          '&scope=openid%20profile%20email';
        window.location.href = base + '?' + params;
      }`
);

// 2. Remove duplicate minified script blocks bolted on at bottom (appears twice)
const dupScript = '<script>window.handleHeaderAuth=function(e){e.preventDefault();if(window.auth0Client){window.auth0Client.loginWithRedirect({authorizationParams:{redirect_uri:window.location.origin}});}};window.handleLogout=function(e){e.preventDefault();if(window.auth0Client){window.auth0Client.logout({logoutParams:{returnTo:window.location.origin}});}};window.handleHeaderAuth=window.handleHeaderAuth;</script>';
while (h.includes(dupScript)) {
  h = h.replace(dupScript, '');
}

// 3. CSS: header-actions styles + hide Tawk "Hi Jason" welcome bubble
h = h.replace(
  `.account-dropdown a:hover{background:#EEF8FA;color:var(--teal)}`,
  `.account-dropdown a:hover{background:#EEF8FA;color:var(--teal)}
.header-actions{display:flex;align-items:center;gap:6px;margin-left:auto}
.hdr-icon-btn{background:none;border:none;cursor:pointer;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#14253e;transition:background .15s}
.hdr-icon-btn:hover{background:#EEF8FA;color:var(--teal)}
.hdr-profile-wrap{position:relative}
.search-bar-wrap{display:none;position:absolute;top:52px;right:0;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:10px 14px;z-index:300;width:280px}
.search-bar-wrap.open{display:flex;gap:8px}
.search-bar-wrap input{flex:1;border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:14px;outline:none}
.search-bar-wrap input:focus{border-color:var(--teal)}
/* Hide Tawk "Hi Jason" welcome bubble */
#tawkchat-minified-box,#tawkchat-minified-wrapper,.tawk-min-container,.tawk-card-container,[class*="tawk-welcome"],[id*="tawk-welcome"]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}`
);

// 4. RC-021f: Fix header order: Search → Telegram → Instagram → Profile → Cart
// Targets current HEAD exactly (Telegram → Instagram → Search → Profile → Cart)
h = h.replace(
  `<div class="header-actions">
  <!-- Telegram -->
  <a class="hdr-icon-btn" href="https://t.me/PepSuppliers" target="_blank" rel="noopener" aria-label="Telegram" style="color:#229ED9">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 14.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/></svg>
  </a>
  <!-- Instagram -->
  <a class="hdr-icon-btn" href="https://instagram.com/pepsuppliers" target="_blank" rel="noopener" aria-label="Instagram" style="color:#E1306C">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
  </a>
  <!-- Search -->
  <div style="position:relative">
    <button class="hdr-icon-btn" id="hdr-search-btn" aria-label="Search" onclick="(function(){var w=document.getElementById('hdr-search-bar');w.classList.toggle('open');if(w.classList.contains('open'))w.querySelector('input').focus();})()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </button>
    <div class="search-bar-wrap" id="hdr-search-bar">
      <input type="text" placeholder="Search peptides…" id="hdr-search-input" onkeydown="if(event.key==='Enter'){var q=this.value.trim();if(q){document.getElementById('hdr-search-bar').classList.remove('open');var cards=document.querySelectorAll('.product-card');cards.forEach(function(c){var n=c.querySelector('h3');if(n&&n.textContent.toLowerCase().includes(q.toLowerCase())){c.style.display='';} else {c.style.display='none';}});}}" />
    </div>
  </div>
  <!-- Profile -->
  <div class="hdr-profile-wrap">
    <button class="hdr-icon-btn" id="header-login-btn" aria-label="Account" onclick="handleHeaderAuth(event)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </button>
    <div class="account-dropdown" id="account-dropdown">
      <a href="#" onclick="handleLogout(event)">Log out</a>
    </div>
  </div>
  <!-- Cart (far right) -->
  <button class="hdr-icon-btn cart-icon-btn" onclick="window.cartOpen()" aria-label="Open cart" style="position:relative">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    <span id="cart-badge" class="cart-badge" style="display:none">0</span>
  </button>
</div>`,
  `<div class="header-actions">
  <!-- Search -->
  <div style="position:relative">
    <button class="hdr-icon-btn" id="hdr-search-btn" aria-label="Search" onclick="(function(){var w=document.getElementById('hdr-search-bar');w.classList.toggle('open');if(w.classList.contains('open'))w.querySelector('input').focus();})()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </button>
    <div class="search-bar-wrap" id="hdr-search-bar">
      <input type="text" placeholder="Search peptides…" id="hdr-search-input" onkeydown="if(event.key==='Enter'){var q=this.value.trim();if(q){document.getElementById('hdr-search-bar').classList.remove('open');var cards=document.querySelectorAll('.product-card');cards.forEach(function(c){var n=c.querySelector('h3');if(n&&n.textContent.toLowerCase().includes(q.toLowerCase())){c.style.display='';} else {c.style.display='none';}});}}" />
    </div>
  </div>
  <!-- Telegram -->
  <a class="hdr-icon-btn" href="https://t.me/PepSuppliers" target="_blank" rel="noopener" aria-label="Telegram" style="color:#229ED9">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 14.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.828.942z"/></svg>
  </a>
  <!-- Instagram -->
  <a class="hdr-icon-btn" href="https://instagram.com/pepsuppliers" target="_blank" rel="noopener" aria-label="Instagram" style="color:#E1306C">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
  </a>
  <!-- Profile -->
  <div class="hdr-profile-wrap">
    <button class="hdr-icon-btn" id="header-login-btn" aria-label="Account" onclick="handleHeaderAuth(event)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </button>
    <div class="account-dropdown" id="account-dropdown">
      <a href="#" onclick="handleLogout(event)">Log out</a>
    </div>
  </div>
  <!-- Cart (far right) -->
  <button class="hdr-icon-btn cart-icon-btn" onclick="window.cartOpen()" aria-label="Open cart" style="position:relative">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    <span id="cart-badge" class="cart-badge" style="display:none">0</span>
  </button>
</div>`
);

// 5. Hide Tawk floating bubble (still opens on checkout)
h = h.replace(
  `var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
Tawk_API.onLoad=function(){ Tawk_API.hideWidget(); };
(function(){`,
  `var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
Tawk_API.onLoad=function(){ Tawk_API.hideWidget(); };
(function(){`
);

fs.writeFileSync('index.html', h, 'utf8');
console.log('before:', before, '-> after:', h.length, '| diff:', h.length - before);
