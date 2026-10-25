const MAX_SCENE_CHARS = 45000;

const num = (v, digits) => +(+v).toFixed(digits);
const vec = (a, digits = 2) => `[${a.map((v) => num(v, digits)).join(',')}]`;
const isZero = (a) => !a || a.every((v) => v === 0);

function partLine(p, withNotes = true) {
  return [
    p.id,
    JSON.stringify(p.name),
    p.kind.replace(' ', ''),
    p.group && `group=${JSON.stringify(p.group)}`,
    `pos=${vec(p.position)}`,
    !isZero(p.rotation) && `rot=${vec(p.rotation, 1)}`,
    p.size ? `size=${vec(p.size)}` : p.volume !== undefined && `vol=${Math.round(p.volume)}`,
    p.bounds && `box=${vec(p.bounds.min, 1)}..${vec(p.bounds.max, 1)}`,
    p.color,
    p.role && p.role !== 'solid' && `role=${p.role}`,
    p.material,
    p.catalog,
    p.supply,
    p.hidden && 'hidden',
    p.referenceImage && 'reference-image',
    withNotes && p.note && `note=${JSON.stringify(p.note)}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function groupLine([name, parts]) {
  const min = [0, 1, 2].map((k) => Math.min(...parts.map((p) => p.bounds.min[k])));
  const max = [0, 1, 2].map((k) => Math.max(...parts.map((p) => p.bounds.max[k])));

  return `${JSON.stringify(name)}: ${parts.length} parts, box=${vec(min, 1)}..${vec(max, 1)}`;
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
    (p) => (!wanted || wanted.has(p.id)) && (!groupName || (p.group ?? '').toLowerCase() === groupName),
  );
}

function header(snap, picked, filtered) {
  const b = snap.bounds;

  return [
    `Frame: ${snap.frame}.`,
    b ? `Scene box ${vec(b.min, 1)}..${vec(b.max, 1)}, size ${vec(b.size, 1)}.` : 'Empty scene.',
    filtered ? `${picked.length} of ${snap.parts.length} parts:` : `${picked.length} parts:`,
  ];
}

function missingIds(parts, ids) {
  const known = new Set(parts.map((p) => p.id));
  const missing = (ids ?? []).filter((id) => !known.has(id));

  return missing.length ? [`Not in the scene: ${missing.join(', ')}.`] : [];
}

export function sceneText(snap, filter = {}) {
  const filtered = !!(filter.ids?.length || filter.group);
  const picked = pickParts(snap.parts, filter);
  const marks = snap.marks?.length ? ['Marks:', ...snap.marks.map((m) => JSON.stringify(m))] : [];
  const list = (withNotes) =>
    [
      ...header(snap, picked, filtered),
      ...picked.map((p) => partLine(p, withNotes)),
      ...missingIds(snap.parts, filter.ids),
      ...marks,
    ].join('\n');
  const full = list(true);

  if (filtered || full.length <= MAX_SCENE_CHARS) return full;

  const noNotes = `${list(false)}\nNotes left out to fit. Call get_scene with group or ids to read them.`;

  if (noNotes.length <= MAX_SCENE_CHARS) return noNotes;

  return [
    ...header(snap, [], false).slice(0, 2),
    `${picked.length} parts are too many to list at once. Call get_scene again with group (or ids) to read them:`,
    ...groupSummary(picked),
    ...marks,
  ].join('\n');
}
