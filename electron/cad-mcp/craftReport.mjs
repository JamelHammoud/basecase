const SHARP_WARN = 0.6;
const BRICK_SOLIDITY = 0.85;
const SHELL_SOLIDITY = 0.2;
const MAX_THREADS = 3;
const MAX_LADDER = 6;
const VISIBLE_SHARE = 0.01;
const SHELL_SHARE = 0.02;
const HEADS = new Set(['socket_head', 'button_head', 'countersunk', 'pan_head', 'hex_bolt']);
const THREADED = /^M\d/;

const pct = (v) => `${Math.round(v * 100)}%`;
const r2 = (v) => Math.round(v * 100) / 100;
const named = (p, extra) => `${p.name} (${extra})`;

function weightedSharp(parts) {
  const rated = parts.filter((p) => p.craft.envelopeSharp != null && p.share > 0);
  const weight = rated.reduce((s, p) => s + p.share, 0);

  if (!weight) return null;

  return {
    value: r2(rated.reduce((s, p) => s + p.share * p.craft.envelopeSharp, 0) / weight),
    unweighted: r2(rated.reduce((s, p) => s + p.craft.envelopeSharp, 0) / rated.length),
    targets: rated
      .filter((p) => p.craft.envelopeSharp > SHARP_WARN)
      .sort((a, b) => b.share * (b.craft.envelopeSharp - 0.4) - a.share * (a.craft.envelopeSharp - 0.4))
      .slice(0, 4),
  };
}

function sharpRow(parts, faceted) {
  const sharp = weightedSharp(parts);

  if (!sharp) return null;

  const warn = sharp.value > SHARP_WARN && !faceted;
  const targets = sharp.targets.map((p) =>
    named(p, `${pct(p.share)} of the visible surface, ${p.craft.envelopeSharp}`),
  );

  return {
    status: warn ? 'WARN' : 'OK',
    name: 'Envelope sharpness',
    detail: `${sharp.value} weighted by visible surface (unweighted ${sharp.unweighted}); expert arms run about 0.4${faceted ? '; faceted design language, so sharp edges are intended' : ''}.`,
    items: warn ? targets.map((t) => `Round the outer edges of ${t}`) : [],
  };
}

function brickRow(parts) {
  const bricks = parts.filter(
    (p) => p.printed && p.craft.solidity > BRICK_SOLIDITY && p.craft.thicknessMm > 8 && Math.min(...p.size) > 15,
  );

  return {
    status: bricks.length ? 'WARN' : 'OK',
    name: 'Printed bricks',
    detail: bricks.length
      ? `${bricks.length} solid printed parts fill over ${pct(BRICK_SOLIDITY)} of their hull.`
      : 'No solid printed bricks.',
    items: bricks.map((p) => `Shell or pocket ${named(p, `solidity ${p.craft.solidity}`)}, unless it's a grip`),
  };
}

function ladderRow(parts, faceted) {
  const visible = parts.filter((p) => p.share >= VISIBLE_SHARE);
  const radii = [...new Set(visible.map((p) => p.craft.dominantRadius).filter(Boolean))].sort((a, b) => a - b);
  const loose = visible.filter((p) => p.craft.dominantShare < 0.4 && p.craft.envelopeSharp < SHARP_WARN);
  const warn = !faceted && (radii.length > MAX_LADDER || loose.length > 0);

  return {
    status: warn ? 'WARN' : 'OK',
    name: 'Radius ladder',
    detail: `${radii.length} main radii on visible parts${radii.length ? ` (R${radii.join(', R')})` : ''}; aim for about ${MAX_LADDER} per robot and one per part.`,
    items: warn ? loose.map((p) => `Pick one main radius for ${p.name} (now R${p.craft.radii.join(', R')})`) : [],
  };
}

function wallRow(parts) {
  const shells = parts.filter(
    (p) => p.printed && p.craft.solidity < SHELL_SOLIDITY && p.share >= SHELL_SHARE && p.craft.walls,
  );
  const off = shells.filter(
    (p) => p.craft.walls.modalMm < 1.6 || p.craft.walls.modalMm > 3.5 || p.craft.walls.consistent < 0.7,
  );
  const modal = [...new Set(shells.map((p) => p.craft.walls.modalMm))].sort((a, b) => a - b);

  return {
    status: off.length ? 'WARN' : 'OK',
    name: 'Shell walls',
    detail: shells.length
      ? `${shells.length} visible shells, modal walls ${modal.join(', ')} mm; aim for one wall between 1.6 and 3.5 mm.`
      : 'No visible thin shells.',
    items: off.map(
      (p) =>
        `Even out ${named(p, `modal ${p.craft.walls.modalMm} mm, ${pct(p.craft.walls.consistent)} within ±0.6 mm`)}`,
    ),
  };
}

function fastenerRows(parts) {
  const hardware = parts.filter((p) => p.hardware && THREADED.test(p.hardware.size));
  const sizes = [...new Set(hardware.map((p) => p.hardware.size))].sort();
  const exposed = parts.filter((p) => HEADS.has(p.hardware?.type) && p.share > 0).sort((a, b) => b.share - a.share);

  return [
    {
      status: sizes.length > MAX_THREADS ? 'WARN' : 'OK',
      name: 'Fastener vocabulary',
      detail: `${sizes.length} thread sizes${sizes.length ? ` (${sizes.join(', ')})` : ''}; expert robots use 1 or 2.`,
      items: sizes.length > MAX_THREADS ? ['Standardize on at most 3 thread sizes'] : [],
    },
    {
      status: exposed.length ? 'WARN' : 'OK',
      name: 'Exposed heads',
      detail: `${exposed.length} screw heads visible from the front, back, sides or top (counterbored ones included).`,
      items: exposed.length
        ? [
            `Counterbore them or move them to hidden faces: ${exposed
              .slice(0, 8)
              .map((p) => p.id)
              .join(', ')}`,
          ]
        : [],
    },
  ];
}

export function craftReport(parts, { faceted = false } = {}) {
  const rated = parts.filter((p) => p.craft);

  return [
    sharpRow(rated, faceted),
    brickRow(rated),
    ladderRow(rated, faceted),
    wallRow(rated),
    ...fastenerRows(parts),
  ].filter(Boolean);
}

export function craftText(rows, unrated = 0) {
  const lines = rows.flatMap((r) => [`${r.status} ${r.name}: ${r.detail}`, ...r.items.map((i) => `- ${i}`)]);
  const note = unrated ? [`${unrated} CAD parts couldn't be measured.`] : [];

  return [
    ...lines,
    ...note,
    'These are hints from expert robots, not gates: a consistent design language matters more than any one number.',
  ].join('\n');
}
