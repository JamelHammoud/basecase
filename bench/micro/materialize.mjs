import { compileCsg } from './csg.mjs';
import { toScene } from './geometry.mjs';

const OP_FIELDS = [
  'id',
  'name',
  'group',
  'position',
  'rotation',
  'color',
  'material',
  'role',
  'supply',
  'note',
  'catalog',
];

function opFields(spec) {
  return Object.fromEntries(OP_FIELDS.filter((k) => spec[k] !== undefined).map((k) => [k, spec[k]]));
}

export async function fixtureOps(fixture) {
  const ops = [];

  for (const spec of fixture.parts) {
    const part = opFields(spec);

    if (spec.solid) Object.assign(part, { shape: 'cad_part', cad: await compileCsg(spec.solid) });

    ops.push({ op: 'add', part });
  }

  return ops;
}

export function sceneJoints(fixture) {
  return (fixture.joints ?? []).map((j) => ({ ...j, origin: toScene(j.origin), axis: toScene(j.axis) }));
}

export function projectOf(fixture) {
  return { printer: 'default', material: 'PLA', infillPct: 15, ...fixture.project, joints: sceneJoints(fixture) };
}

export async function recordFromFixture(fixture, specToPart) {
  const ops = await fixtureOps(fixture);

  return {
    name: fixture.name,
    parts: ops.map((o) => specToPart(o.part)),
    project: projectOf(fixture),
    annotations: [],
  };
}

export async function loadFixtureInApp({ slot, fixture, record }) {
  await slot.api('clear');

  if (record) {
    await slot.api('load', record);

    return record;
  }

  await slot.call('apply', { ops: await fixtureOps(fixture) });

  const built = await slot.api('sceneRecord');
  const start = { name: fixture.name, parts: built.parts, project: projectOf(fixture), annotations: [] };

  await slot.api('load', start);
  await new Promise((r) => setTimeout(r, 1000));

  return slot.api('sceneRecord');
}
