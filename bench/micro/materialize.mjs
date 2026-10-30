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

export async function loadFixtureInApp({ page, call, fixture, record }) {
  await page.evaluate(() => window.__studio.clear());

  if (record) {
    await page.evaluate((r) => window.__studio.load(r), record);

    return record;
  }

  await call('apply', { ops: await fixtureOps(fixture) });

  const built = await page.evaluate(() => window.__studio.sceneRecord());
  const start = { name: fixture.name, parts: built.parts, project: projectOf(fixture), annotations: [] };

  await page.evaluate((r) => window.__studio.load(r), start);
  await new Promise((r) => setTimeout(r, 1000));

  return page.evaluate(() => window.__studio.sceneRecord());
}
