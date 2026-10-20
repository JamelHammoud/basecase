import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { default: sharp } = await import(pathToFileURL(require.resolve('sharp')).href);
const { ICONS } = await import(pathToFileURL(path.resolve(process.argv[2])).href + '?' + Date.now());
const out = process.argv[3];
const ATTRS = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const body = (ic) => (typeof ic === 'string' ? `<path d="${ic}"/>` : `<path d="${ic.d}"/>${ic.extra ?? ''}`);
const names = Object.keys(ICONS);
const S = 2;
const BIG = 96,
  PAD = 16,
  perRow = Number(process.env.PER_ROW || 9);
const rows = Math.ceil(names.length / perRow);
const W = PAD + perRow * (BIG + PAD);
const gridH = PAD + rows * (BIG + 30);
const FEED = process.env.FEED ? JSON.parse(process.env.FEED) : names.map((n) => [n, n, '']);
const rowH = (d) => (d ? 5 + 18 + 17 + 5 : 28);
const feedH = FEED.reduce((s, r) => s + rowH(r[2]), 0) + 24;
const H = gridH + feedH + PAD;
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}"><g transform="scale(${S})"><rect width="100%" height="100%" fill="#121212"/>`;

names.forEach((n, i) => {
  const x = PAD + (i % perRow) * (BIG + PAD),
    y = PAD + Math.floor(i / perRow) * (BIG + 30);

  s += `<g transform="translate(${x},${y})"><rect width="${BIG}" height="${BIG}" rx="8" fill="#1b1b1b"/>`;

  for (let k = 0; k <= 24; k++) {
    const p = (k * BIG) / 24;

    s += `<path d="M${p} 0V${BIG}M0 ${p}H${BIG}" stroke="#fff" stroke-opacity="${k % 12 === 0 ? 0.1 : 0.035}" stroke-width=".5"/>`;
  }

  s += `<rect x="${BIG / 12}" y="${BIG / 12}" width="${(BIG * 20) / 24}" height="${(BIG * 20) / 24}" fill="none" stroke="#0d99ff" stroke-opacity=".3" stroke-dasharray="3 3" stroke-width=".5"/>`;
  s += `<g transform="scale(${BIG / 24})" color="rgba(255,255,255,0.85)" ${ATTRS}>${body(ICONS[n])}</g></g>`;
  s += `<text x="${x + BIG / 2}" y="${y + BIG + 18}" fill="#888" font-family="-apple-system,Helvetica" font-size="12" text-anchor="middle">${n}</text>`;
});

const fx = PAD,
  fy = gridH;

s += `<rect x="${fx}" y="${fy}" width="328" height="${feedH}" rx="12" fill="#1f1f1f"/>`;

let y = fy + 12;

for (const [ic, t, d] of FEED) {
  const top = y + 5;

  s += `<g transform="translate(${fx + 12},${top + 1}) scale(${16 / 24})" color="rgba(255,255,255,0.45)" ${ATTRS}>${body(ICONS[ic])}</g>`;
  s += `<text x="${fx + 36}" y="${top + 13.5}" fill="rgba(255,255,255,0.6)" font-family="-apple-system,Helvetica" font-size="13">${t}</text>`;

  if (d)
    s += `<text x="${fx + 36}" y="${top + 18 + 12.5}" fill="rgba(255,255,255,0.4)" font-family="-apple-system,Helvetica" font-size="12">${d}</text>`;

  y += rowH(d);
}

await sharp(Buffer.from(s + '</g></svg>'))
  .png()
  .toFile(out);
console.log(out);
