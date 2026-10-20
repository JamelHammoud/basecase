import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.resolve('package.json'));
const { default: sharp } = await import(pathToFileURL(require.resolve('sharp')).href);
const { GROUPS } = await import(
  pathToFileURL(path.resolve(process.env.LIB ?? 'tools/icons/library.mjs')).href + '?' + Date.now()
);
const out = process.argv[2] ?? 'icons.png';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const existing = {};
const tool = fs.readFileSync('src/design-system/toolIcons.tsx', 'utf8');

for (const m of tool.matchAll(/export const (\w+) = glyph\(\s*'([^']+)'(?:,\s*'([^']+)'(?:,\s*([\d.]+))?)?/g))
  existing[m[1]] = { d: m[2], dots: m[3], dotSize: m[4] ? +m[4] : 4.5 };

const groups = process.env.LIB ? GROUPS : { ...GROUPS, 'existing feed glyphs': existing };
let uid = 0;

function glyph(spec, { x, y, px, color }) {
  const s = typeof spec === 'string' ? { d: spec } : spec;
  const id = 'm' + uid++;
  const k = px / 24;
  let m = `<path d="${s.d}" ${s.fill ? 'fill="#fff"' : ''}/>`;

  if (s.dots) m += `<path d="${s.dots}" stroke-width="${s.dotSize ?? 4.5}"/>`;

  if (s.dash) m += `<path d="${s.dash}" stroke-dasharray="2.25 2.75"/>`;

  if (s.cut) m += `<path d="${s.cut}" stroke="#000" stroke-width="${s.cutWidth}"/>`;

  if (s.over) m += `<path d="${s.over}"/>`;

  return `<g transform="translate(${x},${y}) scale(${k})"><mask id="${id}" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28"><g color="#fff" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${m}</g></mask><rect x="-2" y="-2" width="28" height="28" fill="${color}" mask="url(#${id})"/></g>`;
}

const BIG = Number(process.env.BIG || 72),
  PAD = 14,
  perRow = Number(process.env.PER_ROW || 10),
  LBL = 34;
const W = PAD + perRow * (BIG + PAD);
let s = '',
  y = PAD;

for (const [g, icons] of Object.entries(groups)) {
  const names = Object.keys(icons).filter((n) => !only || only.includes(n));

  if (!names.length) continue;

  s += `<text x="${PAD}" y="${y + 12}" fill="#bbb" font-family="-apple-system,Helvetica" font-size="13" font-weight="600">${g}</text>`;
  y += 22;
  names.forEach((n, i) => {
    const x = PAD + (i % perRow) * (BIG + PAD),
      yy = y + Math.floor(i / perRow) * (BIG + LBL);

    s += `<rect x="${x}" y="${yy}" width="${BIG}" height="${BIG}" rx="8" fill="#1b1b1b"/>`;
    s += `<rect x="${x + BIG / 12}" y="${yy + BIG / 12}" width="${(BIG * 20) / 24}" height="${(BIG * 20) / 24}" fill="none" stroke="#0d99ff" stroke-opacity=".25" stroke-dasharray="3 3" stroke-width=".5"/>`;
    s += glyph(icons[n], { x, y: yy, px: BIG, color: 'rgba(255,255,255,0.6)' });
    s += `<rect x="${x + BIG - 22}" y="${yy + BIG + 3}" width="22" height="22" rx="5" fill="#262626"/>`;
    s += glyph(icons[n], { x: x + BIG - 19, y: yy + BIG + 6, px: 16, color: 'rgba(255,255,255,0.6)' });
    s += `<text x="${x}" y="${yy + BIG + 18}" fill="#888" font-family="-apple-system,Helvetica" font-size="9.5">${n.replace(/Icon$/, '')}</text>`;
  });
  y += Math.ceil(names.length / perRow) * (BIG + LBL) + 8;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${(y + PAD) * 2}"><g transform="scale(2)"><rect width="100%" height="100%" fill="#121212"/>${s}</g></svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log(out);
