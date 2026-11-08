#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? 'build/icon/BasecaseDev.icon/Assets/blueprint.svg');

const KEYLINE = { inset: 64, radius: 200, width: 14 };
const RING = { center: 512, half: 300 };
const GUIDE = { width: 6, opacity: 0.75, dashes: 17, dashShare: 0.6 };

const guides = [RING.center - RING.half, RING.center + RING.half];
const cornerCenter = KEYLINE.inset + KEYLINE.radius;
const reach = Math.abs(guides[0] - cornerCenter);
const start = cornerCenter - Math.sqrt(KEYLINE.radius ** 2 - reach ** 2);
const stop = 1024 - start;
const period = (guides[1] - guides[0]) / GUIDE.dashes;
const dash = period * GUIDE.dashShare;

const segments = [];

for (let k = -5; k <= GUIDE.dashes + 5; k++) {
  const middle = guides[0] + k * period;
  const a = Math.max(middle - dash / 2, start);
  const b = Math.min(middle + dash / 2, stop);

  if (b - a >= 2) segments.push([a, b]);
}

const f = (n) => n.toFixed(1);
const d = guides.flatMap((g) => segments.map(([a, b]) => `M${g} ${f(a)}V${f(b)}M${f(a)} ${g}H${f(b)}`)).join('');
const size = 1024 - 2 * KEYLINE.inset;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <g opacity="${GUIDE.opacity}">
    <path fill="none" stroke="#ffffff" stroke-width="${GUIDE.width}" d="${d}"/>
  </g>
  <rect x="${KEYLINE.inset}" y="${KEYLINE.inset}" width="${size}" height="${size}" rx="${KEYLINE.radius}" fill="none" stroke="#ffffff" stroke-width="${KEYLINE.width}"/>
</svg>
`;

fs.writeFileSync(out, svg);
console.log(`[icon-dev-guides] ${segments.length * 4} dashes → ${path.relative(process.cwd(), out)}`);
