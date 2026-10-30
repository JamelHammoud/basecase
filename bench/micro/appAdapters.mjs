import { AdapterMissing } from './adapterMissing.mjs';

const STRUCTURAL = /frame|chassis|pelvis|spine|skeleton/i;

async function assemblyData(ctx, name) {
  if (!ctx.app) throw new AdapterMissing(name, 'check_assembly from the running app');

  const res = await ctx.app.call('assembly');

  if (!res?.data) throw new AdapterMissing(name, 'structured check_assembly data');

  return res.data;
}

export async function removalOrder(ctx, _scene, { screws } = {}) {
  const data = await assemblyData(ctx, 'removalOrder');
  const wanted = screws?.length ? screws : Object.keys(data.screws);
  const stuck = wanted.filter((id) => data.screws[id]?.verdict === 'stuck');

  return {
    pass: stuck.length === 0,
    detail: stuck.length ? `stuck: ${stuck.join(', ')}` : `${wanted.length} drivable`,
  };
}

const partOf = (scene, id) => scene?.parts?.find((p) => p.id === id);
const isActuated = (scene, id) => Boolean(partOf(scene, id)?.jointId) || /servo|actuator/i.test(id);

function serviceProblems(row, scene, args) {
  const out = row.partsOut ?? [];

  return [
    row.steps === null && 'no way out',
    row.steps !== null && args.maxSteps !== undefined && row.steps > args.maxSteps && `${row.steps} steps`,
    ...(args.forbid ?? []).filter((id) => out.includes(id)).map((id) => `removes ${id}`),
    args.forbidJoints && out.some((id) => isActuated(scene, id)) && 'removes an actuated part',
    args.forbidStructural && out.some((id) => STRUCTURAL.test(id)) && 'removes a structural part',
  ].filter(Boolean);
}

export async function serviceDepth(ctx, scene, args = {}) {
  const data = await assemblyData(ctx, 'serviceDepth');
  const row = data.service.find((r) => r.id === args.target) ?? data.service.find((r) => r.id.includes(args.target));

  if (!row) return { pass: false, detail: `${args.target} isn't a serviceable part in this scene` };

  const problems = serviceProblems(row, scene, args);
  const steps = row.steps === null ? 'no path' : `${row.steps} steps`;

  return { pass: problems.length === 0, detail: problems.length ? problems.join('; ') : steps };
}

export async function enclosures(ctx) {
  const data = await assemblyData(ctx, 'enclosures');

  return {
    pass: data.enclosing.length === 0,
    detail: data.enclosing.length ? `encloses its contents: ${data.enclosing.join(', ')}` : 'none',
  };
}

const craftOf = (scene, id) => partOf(scene, id)?.cad?.audit?.craft ?? null;

function craftDrop(ctx, part, key) {
  const before = craftOf(ctx.before, part)?.[key];
  const after = craftOf(ctx.after, part)?.[key];

  if (before === undefined || after === undefined || before === null || after === null) return `${key} not measured`;

  return after < before ? null : `${key} ${before} → ${after}`;
}

function solidityProblems(scene, max) {
  return (scene?.parts ?? [])
    .filter((p) => p.cad?.audit?.craft?.solidity > max && !/grip|pad|sole/i.test(`${p.id} ${p.name}`))
    .map((p) => `${p.id} solidity ${p.cad.audit.craft.solidity}`);
}

function wallProblems(scene) {
  return (scene?.parts ?? [])
    .filter((p) => p.cad?.audit?.craft?.walls && p.cad.audit.craft.walls.consistent < 0.6)
    .map((p) => `${p.id} walls inconsistent`);
}

const hasCraft = (scene) => (scene?.parts ?? []).some((p) => p.cad?.audit?.craft);

export function craft(ctx, scene, args = {}) {
  if (!hasCraft(scene))
    throw new AdapterMissing('craft', 'craft metrics from model_part (grade a scene compiled in the app)');

  const problems = [
    args.sharpShareDrops && craftDrop(ctx, args.part, 'envelopeSharp'),
    ...(args.maxSolidity ? solidityProblems(scene, args.maxSolidity) : []),
    ...(args.wallConsistency ? wallProblems(scene) : []),
  ].filter(Boolean);
  const unmeasured = ['maxOverhangDeg', 'featureCountDrops', 'noExposedInternals'].filter((k) => args[k]);

  return {
    pass: problems.length === 0,
    detail: [problems.join('; ') || 'ok', unmeasured.length ? `not measured: ${unmeasured.join(', ')}` : '']
      .filter(Boolean)
      .join('; '),
  };
}

const actuatorUsd = (bom) => bom?.actuatorsUsd ?? null;

export async function servoSolver(ctx, _scene, { tolerance = 0.15 } = {}) {
  if (!ctx.app) throw new AdapterMissing('servoSolver', 'size_actuators from the running app');

  const solved = (await ctx.app.call('size_actuators'))?.data;

  if (!solved) throw new AdapterMissing('servoSolver', 'joints for size_actuators (define_joints first)');

  if (solved.cheapestActuatorsUsd === null) return { pass: false, detail: 'no actuator set passes these loads' };

  const spent = actuatorUsd(await ctx.adapters.bom(ctx));

  if (spent === null) throw new AdapterMissing('servoSolver', 'the actuator total from the BOM');

  const regret = spent / solved.cheapestActuatorsUsd - 1;

  return {
    pass: regret <= tolerance,
    detail: `actuators $${spent} vs cheapest passing $${solved.cheapestActuatorsUsd} (${Math.round(regret * 100)}%)`,
  };
}
