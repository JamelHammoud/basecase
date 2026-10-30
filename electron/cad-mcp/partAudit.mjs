const HULL_COLLAPSE = 0.5;
const FUSE_FIX = 'Fuse them with at least 0.2 mm overlap';

const kmm3 = (v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);
const at = (p) => `[${p.join(', ')}]`;
const pct = (v) => `${Math.round(v * 100)}%`;

function topologyLines(audit) {
  const lines = [];

  if (audit.nonManifoldEdges) {
    const where = audit.spots.map((s) => `${at(s.at)} (${s.edges})`).join(', ');

    lines.push(
      `Topology: ${audit.nonManifoldEdges} non-manifold edges, where solids touch only along an edge, around ${where}. ${FUSE_FIX}, or move them apart.`,
    );
  }

  if (audit.bodies > 1) {
    lines.push(
      `Topology: ${audit.bodies} separate bodies; they print as loose pieces. ${FUSE_FIX}, or model them as separate parts.`,
    );
  }

  if (audit.openEdges) {
    lines.push(
      `Topology: ${audit.openEdges} open edges; the kernel returned a broken solid, usually a fillet or chamfer bigger than a face it touches. Use a smaller size there.`,
    );
  }

  return lines;
}

function revisionWarnings(before, audit) {
  const lines = [];
  const hullShare = before?.hullVolume && audit.hullVolume ? audit.hullVolume / before.hullVolume : 1;

  if (hullShare < HULL_COLLAPSE) {
    lines.push(
      `Warning: the outline collapsed (convex hull down to ${pct(hullShare)} of the last revision). Check for a boolean that removed most of the part.`,
    );
  }

  if (before?.bodies && audit.bodies > before.bodies) {
    lines.push('Warning: the part fell apart into more bodies than the last revision.');
  }

  return lines;
}

export function revisionLines(previous, audit, volume) {
  if (!previous?.exists || previous.volume == null) return [];

  const before = previous.audit;
  const change = previous.volume ? (volume - previous.volume) / previous.volume : 0;
  const facts = [
    `volume ${kmm3(previous.volume)} → ${kmm3(volume)} mm³ (${change >= 0 ? '+' : ''}${pct(change)})`,
    before?.hullVolume && audit.hullVolume && `hull ${kmm3(before.hullVolume)} → ${kmm3(audit.hullVolume)} mm³`,
    before?.bodies && `bodies ${before.bodies} → ${audit.bodies}`,
  ].filter(Boolean);

  return [`Since the last revision: ${facts.join(', ')}.`, ...revisionWarnings(before, audit)];
}

const VISIBLE = 0.01;
const VISIBLE_SHELL = 0.02;

function sharpLine(craft, size, share) {
  const shows = share == null || share >= VISIBLE;

  if (!shows || Math.max(...size) <= 20 || (craft.envelopeSharp ?? 0) <= 0.6) return [];

  const seen = share == null ? '' : ` It's ${pct(share)} of the robot's visible surface.`;
  const box = craft.boxiness > 0.92 ? ' and it fills its bounding box' : '';

  return [
    `Craft: ${pct(craft.envelopeSharp)} of the outer edge turning is sharper than 60°${box}.${seen} Round the visible envelope with one radius and keep functional edges sharp, unless the design language is faceted.`,
  ];
}

function craftLines(craft, size, share) {
  if (!craft) return [];

  const lines = sharpLine(craft, size, share);
  const minSide = Math.min(...size);
  const shell = craft.solidity < 0.2 && (share == null || share >= VISIBLE_SHELL);

  if (craft.solidity > 0.85 && craft.thicknessMm > 8 && minSide > 15) {
    lines.push(
      `Craft: a printed brick (fills ${pct(craft.solidity)} of its hull). Shell or pocket it with 2.4–3.2 mm walls, unless it's a grip.`,
    );
  }

  if (craft.walls?.thinShare > 0.02) {
    lines.push(
      `Walls under 0.9 mm on ${pct(craft.walls.thinShare)} of the surface (thinnest ${craft.walls.thinnest.mm} mm at ${at(craft.walls.thinnest.at)}). Make them at least 0.9 mm (two perimeters).`,
    );
  }

  if (shell && craft.walls && craft.walls.consistent < 0.7) {
    lines.push(
      `Shell walls vary: modal ${craft.walls.modalMm} mm, ${pct(craft.walls.consistent)} within ±0.6 mm. Keep one wall thickness.`,
    );
  }

  if (craft.radii.length > 4) {
    lines.push(`Craft: ${craft.radii.length} envelope radii (R${craft.radii.join(', R')}). Pick one dominant radius.`);
  }

  return lines;
}

function summaryLine(audit) {
  const c = audit.craft;
  const facts = [
    `${audit.bodies} ${audit.bodies === 1 ? 'body' : 'bodies'}`,
    audit.genus != null && `genus ${audit.genus}`,
    c?.solidity != null && `solidity ${c.solidity}`,
    c?.envelopeSharp != null && `envelope sharp ${c.envelopeSharp}`,
    c?.dominantRadius && `main radius ≈ R${c.dominantRadius}`,
    c?.walls && `modal wall ${c.walls.modalMm} mm`,
  ].filter(Boolean);

  return `Audit: ${facts.join(', ')}.`;
}

function portLines(ports) {
  if (!ports?.length) return [];

  const ok = ports.filter((p) => p.check !== 'failed').map((p) => p.name);
  const failed = ports.filter((p) => p.check === 'failed');

  return [
    `Ports: ${ok.length ? ok.join(', ') : 'none'} ok${failed.length ? `; ${failed.length} failed` : ''}.`,
    ...failed.map(
      (p) => `- Port ${p.name} (${p.kind}) at ${at(p.position)}: ${p.problem}. Fix the port or the geometry.`,
    ),
  ];
}

function checkLines(checks, changes) {
  if (!checks?.length && !changes.length) return [];

  const rows = checks.map((c) => {
    if (c.pass === null) return `- ${c.name}: ${c.want}; not measured (${c.got}).`;

    return c.pass ? `- pass ${c.want}: ${c.got}.` : `- FAIL ${c.want}: ${c.got}. ${c.fix}`;
  });

  return [...changes, ...(rows.length ? ['Requirements:', ...rows] : [])];
}

export function auditText({ audit, previous, stats, changes = [], share = null }) {
  if (!audit) return '';

  if (audit.error || audit.skipped) return `\nAudit skipped: ${audit.error ?? audit.skipped}.`;

  const lines = [
    summaryLine(audit),
    ...topologyLines(audit),
    ...revisionLines(previous, audit, stats.volume),
    ...checkLines(audit.checks, changes),
    ...portLines(audit.ports),
    ...craftLines(audit.craft, stats.bbox.size, share),
  ];

  return `\n${lines.join('\n')}`;
}

export const storedAudit = (audit) =>
  audit && !audit.error && !audit.skipped
    ? {
        bodies: audit.bodies,
        genus: audit.genus,
        nonManifoldEdges: audit.nonManifoldEdges,
        openEdges: audit.openEdges,
        hullVolume: audit.hullVolume,
        craft: audit.craft && {
          ...audit.craft,
          walls: audit.craft.walls && { ...audit.craft.walls, thinnest: undefined },
        },
      }
    : undefined;
