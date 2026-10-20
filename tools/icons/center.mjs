import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.resolve('package.json'));
const { default: sharp } = await import(pathToFileURL(require.resolve('sharp')).href);
const { GROUPS } = await import(pathToFileURL(path.resolve('tools/icons/library.mjs')).href);
const PX = 240;
const icons = Object.assign({}, ...Object.values(GROUPS));
const tool = fs.readFileSync('src/design-system/toolIcons.tsx', 'utf8');

for (const m of tool.matchAll(
  /export const (\w+) = glyph\(\s*(?:'([^']+)'|\{\s*d: '([^']+)',\s*dots: '([^']+)',\s*dotSize: ([\d.]+),?\s*\})/g,
))
  icons[m[1]] = m[2] ? m[2] : { d: m[3], dots: m[4], dotSize: +m[5] };

const body = (ic) => {
  const s = typeof ic === 'string' ? { d: ic } : ic;
  let m = `<path d="${s.d}" ${s.fill ? 'fill="#fff"' : ''}/>`;

  if (s.dots) m += `<path d="${s.dots}" stroke-width="${s.dotSize ?? 4.5}"/>`;

  if (s.dash) m += `<path d="${s.dash}"/>`;

  if (s.cut) m += `<path d="${s.cut}" stroke="#000" stroke-width="${s.cutWidth ?? 5.5}"/>`;

  if (s.over) m += `<path d="${s.over}"/>`;

  return m;
};

async function measure(ic) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}" viewBox="-2 -2 28 28"><rect x="-2" y="-2" width="28" height="28"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body(ic)}</g></svg>`;
  const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  const s = { x0: PX, y0: PX, x1: 0, y1: 0, m: 0, mx: 0, my: 0 };

  for (let i = 0; i < data.length; i++) {
    const v = data[i] / 255;

    if (v < 0.5) continue;

    const x = i % PX,
      y = Math.floor(i / PX);

    Object.assign(s, { x0: Math.min(s.x0, x), x1: Math.max(s.x1, x), y0: Math.min(s.y0, y), y1: Math.max(s.y1, y) });
    s.m += v;
    s.mx += v * x;
    s.my += v * y;
  }

  const grid = (p) => (p * 28) / PX - 2;
  const r = (v) => +v.toFixed(2);

  return {
    box: [r((grid(s.x0) + grid(s.x1)) / 2 - 12), r((grid(s.y0) + grid(s.y1)) / 2 - 12)],
    mass: [r(grid(s.mx / s.m) - 12), r(grid(s.my / s.m) - 12)],
    size: [r(grid(s.x1) - grid(s.x0)), r(grid(s.y1) - grid(s.y0))],
  };
}

const limit = Number(process.env.LIMIT ?? 0.5);

for (const [name, ic] of Object.entries(icons)) {
  const { box, mass, size } = await measure(ic);
  const off = Math.max(...box.map(Math.abs), ...mass.map((v) => Math.abs(v) / 2));

  if (off > limit)
    console.log(
      name.padEnd(20),
      'box',
      box.join(', ').padEnd(14),
      'mass',
      mass.join(', ').padEnd(14),
      'size',
      size.join(' × '),
    );
}
