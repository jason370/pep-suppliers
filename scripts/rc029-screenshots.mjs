import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'rc029-evidence');

function serve(root) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let p = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname === '/') p = path.join(root, 'index.html');
    if (!p.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(p, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end();
      }
      const ext = path.extname(p).toLowerCase();
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = serve(ROOT);
  await new Promise((r) => server.listen(8765, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.goto('http://localhost:8765/index.html#us-warehouse', { waitUntil: 'networkidle' });
  const ageBtn = page.locator('button:has-text("Enter site"), button:has-text("Enter")').first();
  if (await ageBtn.count()) {
    await page.locator('input[type="checkbox"]').first().check({ force: true }).catch(() => {});
    await ageBtn.click({ force: true }).catch(() => {});
  }
  await page.waitForSelector('.product-card .card-img-wrap', { timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, 'catalog-desktop.png'), fullPage: false });

  const tablet = await browser.newPage({ viewport: { width: 820, height: 1100 } });
  await tablet.goto('http://localhost:8765/index.html#us-warehouse', { waitUntil: 'networkidle' });
  if (await ageBtn.count()) {
    await tablet.locator('input[type="checkbox"]').first().check({ force: true }).catch(() => {});
    await tablet.locator('button:has-text("Enter site"), button:has-text("Enter")').first().click({ force: true }).catch(() => {});
  }
  await tablet.waitForSelector('.product-card .card-img-wrap');
  await tablet.screenshot({ path: path.join(OUT, 'catalog-tablet.png') });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await mobile.goto('http://localhost:8765/index.html#us-warehouse', { waitUntil: 'networkidle' });
  await mobile.locator('input[type="checkbox"]').first().check({ force: true }).catch(() => {});
  await mobile.locator('button:has-text("Enter site"), button:has-text("Enter")').first().click({ force: true }).catch(() => {});
  await mobile.waitForSelector('.product-card .card-img-wrap');
  await mobile.screenshot({ path: path.join(OUT, 'catalog-mobile.png') });

  const pid = 'bpc-157-us-warehouse';
  const prod = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  await prod.goto(`http://localhost:8765/product.html?id=${pid}`, { waitUntil: 'networkidle' });
  await prod.waitForSelector('#product-vial-img');
  await prod.screenshot({ path: path.join(OUT, 'product-page-desktop.png') });

  await browser.close();
  server.close();
  console.log('Screenshots saved to', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
