import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'rc029-evidence');
const ids = ['abp-7-us-warehouse', 'adipotide-ftpp-us-warehouse', 'bpc-157-us-warehouse'];

async function compositeOn(bg, vialPath) {
  const meta = await sharp(vialPath).metadata();
  const vial = await sharp(vialPath).resize({ height: 160 }).toBuffer();
  const vm = await sharp(vial).metadata();
  const left = Math.round((280 - vm.width) / 2);
  const top = Math.round((220 - vm.height) / 2);
  return sharp({
    create: { width: 280, height: 220, channels: 3, background: bg },
  })
    .composite([{ input: vial, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const backgrounds = [
    ['white', '#ffffff'],
    ['lavender', '#ede9f6'],
    ['dark', '#071833'],
  ];
  for (const id of ids) {
    const vial = path.join(ROOT, 'images', 'vials', `${id}.png`);
    for (const [name, color] of backgrounds) {
      const buf = await compositeOn(color, vial);
      fs.writeFileSync(path.join(OUT, `${id}-${name}.png`), buf);
    }
  }
  console.log('Evidence images written to', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
