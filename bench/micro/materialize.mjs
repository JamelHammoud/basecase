import { compileCsg } from './csg.mjs';
import { toScene } from './geometry.mjs';
import { importedParts } from './imported.mjs';

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

export const withCases = (record, cases) => ({ ...record, project: { ...record.project, cases } });

export function keepStartCases(record, start) {
  const cases = start?.project?.cases;

  return cases?.length && !record.project?.cases?.length ? withCases(record, cases) : record;
}

function fixtureCases(record, specs, caseKit) {
  const { buildCase, builderRobot, buildRig } = caseKit;
  const robot = builderRobot(buildRig(record.project.joints, record.parts), record.parts);

  return specs.map((spec) => {
    const made = buildCase(spec, robot);

    if (!made.ok) throw new Error(`${record.name}'s Case can't be built: ${made.problem}`);

    return made.kase;
  });
}

export async function recordFromFixture(fixture, specToPart, caseKit = null) {
  const ops = await fixtureOps(fixture);
  const record = {
    name: fixture.name,
    parts: [...ops.map((o) => specToPart(o.part)), ...(await importedParts(fixture))],
    project: projectOf(fixture),
    annotations: [],
  };

  if (!fixture.cases?.length) return record;

  if (!caseKit) throw new Error(`${fixture.name} has Cases, and building them needs the app's Case builder`);

  return withCases(record, fixtureCases(record, fixture.cases, caseKit));
}

const snakeCase = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export const casePayload = ({ goal, world, name, values = {}, ...spec }) => ({
  goal,
  world,
  ...(name ? { name } : {}),
  ...(spec.console ? { console: spec.console } : {}),
  ...Object.fromEntries(Object.entries(values).map(([k, v]) => [snakeCase(k), v])),
});

const CASES_SAVED_MS = 10000;

async function sceneWithCases(slot, count) {
  const t0 = Date.now();

  for (;;) {
    const scene = await slot.api('sceneRecord');

    if ((scene.project?.cases?.length ?? 0) >= count) return scene;

    if (Date.now() - t0 > CASES_SAVED_MS) throw new Error(`The app made the fixture's Cases but its scene lacks them`);

    await new Promise((r) => setTimeout(r, 200));
  }
}

async function addCasesInApp(slot, specs = []) {
  for (const spec of specs) {
    const made = await slot.call('create_case', casePayload(spec));

    if (!made?.ok) throw new Error(`create_case refused the fixture's Case: ${made?.problem ?? made?.error}`);
  }

  return sceneWithCases(slot, specs.length);
}

export async function loadFixtureInApp({ slot, fixture, record }) {
  await slot.api('clear');

  if (record) {
    await slot.api('load', record);

    return record;
  }

  const ops = await fixtureOps(fixture);

  if (ops.length) await slot.call('apply', { ops });

  const built = ops.length ? await slot.api('sceneRecord') : { parts: [] };
  const parts = [...built.parts, ...(await importedParts(fixture))];
  const start = { name: fixture.name, parts, project: projectOf(fixture), annotations: [] };

  await slot.api('load', start);
  await new Promise((r) => setTimeout(r, 1000));

  return addCasesInApp(slot, fixture.cases);
}
