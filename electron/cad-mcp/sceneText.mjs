import { plural } from '../plural.mjs';

const MAX_SCENE_CHARS = 45000;
const FULL_LIST_PARTS = 20;
const IDS_PER_GROUP = 40;

const num = (v, digits) => +(+v).toFixed(digits);
const vec = (a, digits = 2) => `[${a.map((v) => num(v, digits)).join(',')}]`;
const isZero = (a) => !a || a.every((v) => v === 0);

const links = (p) => [
  p.operandOf && `operand-of=${p.operandOf}`,
  p.operands && `operands=[${p.operands.map((o) => o.id).join(',')}]`,
  p.mirrorOf && `mirror-of=${p.mirrorOf}`,
  p.frame && `frame=${p.frame}`,
];

export function partLine(p, withNotes = true) {
  return [
    p.id,
    JSON.stringify(p.name),
    p.kind.replace(' ', ''),
    p.group && `group=${JSON.stringify(p.group)}`,
    `pos=${vec(p.position)}`,
    !isZero(p.rotation) && `rot=${vec(p.rotation, 1)}`,
    p.size ? `size=${vec(p.size)}` : p.volume !== undefined && `vol=${Math.round(p.volume)}`,
    p.edges && `edges=${p.edges.kind}:${num(p.edges.mm, 2)}`,
    p.bounds && `box=${vec(p.bounds.min, 1)}..${vec(p.bounds.max, 1)}`,
    p.color,
    p.role && p.role !== 'solid' && `role=${p.role}`,
    p.material,
    p.catalog,
    p.supply,
    ...links(p),
    p.ports && `ports=${p.ports}`,
    p.hidden && 'hidden',
    p.referenceImage && 'reference-image',
    withNotes && p.note && `note=${JSON.stringify(p.note)}`,
  ]
    .filter(Boolean)
    .join(' ');
}

export const partLines = (p, withNotes = true, depth = 0) => [
  `${'  '.repeat(depth)}${partLine(p, withNotes)}`,
  ...(p.operands ?? []).flatMap((o) => partLines(o, withNotes, depth + 1)),
];

const treeIds = (p) => [p.id, ...(p.operands ?? []).flatMap(treeIds)];

function groupLine([name, parts]) {
  const min = [0, 1, 2].map((k) => Math.min(...parts.map((p) => p.bounds.min[k])));
  const max = [0, 1, 2].map((k) => Math.max(...parts.map((p) => p.bounds.max[k])));
  const ids = parts.slice(0, IDS_PER_GROUP).map((p) => p.id);
  const more = parts.length > IDS_PER_GROUP ? ` +${parts.length - IDS_PER_GROUP} more` : '';

  return `${JSON.stringify(name)}: ${plural(parts.length, 'part')}, box=${vec(min, 1)}..${vec(max, 1)}, ids ${ids.join(' ')}${more}`;
}

function groupSummary(parts) {
  const groups = new Map();

  for (const p of parts) {
    const name = p.group ?? '(no group)';

    groups.set(name, [...(groups.get(name) ?? []), p]);
  }

  return [...groups].map(groupLine);
}

function pickParts(parts, { ids, group }) {
  const wanted = ids?.length ? new Set(ids) : null;
  const groupName = group?.trim().toLowerCase();

  return parts.filter(
    (p) =>
      (!wanted || treeIds(p).some((id) => wanted.has(id))) &&
      (!groupName || (p.group ?? '').toLowerCase() === groupName),
  );
}

function header(snap, picked, filtered) {
  const b = snap.bounds;

  return [
    `Frame: ${snap.frame}.`,
    b ? `Scene box ${vec(b.min, 1)}..${vec(b.max, 1)}, size ${vec(b.size, 1)}.` : 'Empty scene.',
    filtered ? `${picked.length} of ${plural(snap.parts.length, 'part')}:` : `${plural(picked.length, 'part')}:`,
  ];
}

function missingIds(parts, ids) {
  const known = new Set(parts.flatMap(treeIds));
  const missing = (ids ?? []).filter((id) => !known.has(id));

  return missing.length ? [`Not in the scene: ${missing.join(', ')}.`] : [];
}

function summary(snap, picked, extras) {
  return [
    ...header(snap, [], false).slice(0, 2),
    `${plural(picked.length, 'part')}, by group. Call get_scene with group or ids for full lines (placement, size, box, ports, notes), or find_in_scene to search:`,
    ...groupSummary(picked),
    ...extras,
  ].join('\n');
}

export function sceneText(snap, filter = {}) {
  const filtered = !!(filter.ids?.length || filter.group);
  const picked = pickParts(snap.parts, filter);
  const extras = [
    ...(snap.marks?.length ? ['Marks:', ...snap.marks.map((m) => JSON.stringify(m))] : []),
    ...(snap.caseConsole ? ['Case console (as the user arranged it):', JSON.stringify(snap.caseConsole)] : []),
  ];
  const list = (withNotes) =>
    [
      ...header(snap, picked, filtered),
      ...picked.flatMap((p) => partLines(p, withNotes)),
      ...missingIds(snap.parts, filter.ids),
      ...extras,
    ].join('\n');

  if (!filtered && picked.length > FULL_LIST_PARTS) return summary(snap, picked, extras);

  const full = list(true);

  if (full.length <= MAX_SCENE_CHARS) return full;

  const noNotes = `${list(false)}\nNotes left out to fit. Call get_scene with fewer ids to read them.`;

  return noNotes.length <= MAX_SCENE_CHARS || filtered ? noNotes : summary(snap, picked, extras);
}
