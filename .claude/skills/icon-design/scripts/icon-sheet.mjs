#!/usr/bin/env node
// Renders icon candidates as a PNG sheet for review: each icon big on the 24 grid (outline and
// filled), then in a mock view rail at 2× (idle · hover · active) and at real size (1×).
//
//   node .claude/skills/icon-design/scripts/icon-sheet.mjs <candidates.mjs> <out.png>
//
// The candidates module default-exports { name: { o, f? } | 'lucide:<name>' }:
//   o  outline SVG body (inside a 24 × 24 viewBox; stroke 2, round caps/joins, no fill is inherited)
//   f  filled SVG body; the token MASK is replaced with a unique id per render
// 'lucide:settings' pulls an installed lucide icon, so neighbours sit beside the candidates.
// Run it from the repo root (it loads sharp and lucide-react from ./node_modules).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [candFile, out] = process.argv.slice(2);
if (!candFile || !out) {
  console.error('usage: icon-sheet.mjs <candidates.mjs> <out.png>');
  process.exit(1);
}
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { default: sharp } = await import(pathToFileURL(require.resolve('sharp')).href);
const { default: icons } = await import(pathToFileURL(path.resolve(candFile)).href + '?' + Date.now());

const lucideBody = async (name) => {
  const file = path.join(path.dirname(require.resolve('lucide-react/package.json')), 'dist/esm/icons', `${name}.mjs`);
  const { __iconData } = await import(pathToFileURL(file).href);
  return __iconData.node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
};
for (const [name, ic] of Object.entries(icons)) {
  if (typeof ic === 'string' && ic.startsWith('lucide:')) icons[name] = { o: await lucideBody(ic.slice(7)) };
}

const ATTRS = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
let uid = 0;
const glyph = (ic, filled, color) => `<g color="${color}" ${ATTRS}>${filled && ic.f ? ic.f.replaceAll('MASK', `m${uid++}`) : ic.o}</g>`;

const names = Object.keys(icons);
const BIG = 150, PAD = 22, COL = 2 * BIG + 3 * PAD;
const W = PAD + names.length * COL, H = PAD + BIG + 34 + 90 + 60;
const grid = () => {
  let g = '';
  for (let k = 0; k <= 24; k++) {
    const p = (k * BIG) / 24;
    g += `<path d="M${p} 0V${BIG}M0 ${p}H${BIG}" stroke="#fff" stroke-opacity="${k % 12 === 0 ? 0.12 : 0.04}"/>`;
  }
  // The 2–22 live area
  return g + `<rect x="${BIG / 12}" y="${BIG / 12}" width="${(BIG * 20) / 24}" height="${(BIG * 20) / 24}" fill="none" stroke="#0d99ff" stroke-opacity=".3" stroke-dasharray="4 4"/>`;
};
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#0b0b0d"/>`;
names.forEach((n, i) => {
  const x0 = PAD + i * COL, ic = icons[n];
  [false, true].forEach((filled, j) => {
    const x = x0 + j * (BIG + PAD);
    s += `<g transform="translate(${x},${PAD})"><rect width="${BIG}" height="${BIG}" fill="#141417" rx="10"/>${grid()}`;
    s += `<g transform="scale(${BIG / 24})">${glyph(ic, filled, '#fff')}</g></g>`;
  });
  const cx = x0 + BIG + PAD / 2, by = PAD + BIG + 40;
  s += `<text x="${cx}" y="${PAD + BIG + 22}" fill="#999" font-family="Helvetica" font-size="14" text-anchor="middle">${n}</text>`;
  // Rail states as IconButton draws them: ghost idle white/45, hover white/90 on white/6, active white on white/10
  [['none', 'rgba(255,255,255,0.45)', false], ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.9)', false], ['rgba(255,255,255,0.1)', '#fff', true]].forEach(([bg, col, f], k) => {
    const bx = cx - 124 + k * 88;
    s += `<rect x="${bx}" y="${by}" width="72" height="72" rx="20" fill="${bg}"/><g transform="translate(${bx + 18},${by + 18}) scale(1.5)">${glyph(ic, f, col)}</g>`;
  });
  const y1 = by + 86;
  [['none', 'rgba(255,255,255,0.45)', false], ['rgba(255,255,255,0.1)', '#fff', true]].forEach(([bg, col, f], k) => {
    const bx = cx - 44 + k * 52;
    s += `<rect x="${bx}" y="${y1}" width="36" height="36" rx="10" fill="${bg}"/><g transform="translate(${bx + 9},${y1 + 9}) scale(0.75)">${glyph(ic, f, col)}</g>`;
  });
});
await sharp(Buffer.from(s + '</svg>')).png().toFile(out);
console.log(out);
