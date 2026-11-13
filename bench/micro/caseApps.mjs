import { AdapterMissing } from './adapterMissing.mjs';
import { check } from './checks.mjs';

const CAMERA = {
  kind: 'component',
  category: 'perception',
  role: 'solid',
  componentId: 'raspberry-pi-camera-3',
  rotation: [0, 0, 0],
  dimensions: { width: 25, height: 12, depth: 24 },
  color: '#333333',
  note: '',
  visible: true,
  locked: false,
};

const CAMERA_MOUNTS = {
  'rover-diff': { on: 'chassis', name: 'Front Camera', position: [0, 82, 95] },
  'arm-6dof': { name: 'Overhead Camera', position: [0, 600, 250] },
};

function withCamera(robot) {
  const mount = CAMERA_MOUNTS[robot.id];
  const group = { id: `${robot.id}-body`, name: robot.id };
  const camera = { ...CAMERA, id: 'camera', name: mount.name, position: mount.position };

  if (!mount.on) return { ...robot, parts: [...robot.parts, camera] };

  return {
    ...robot,
    parts: [...robot.parts.map((p) => (p.id === mount.on ? { ...p, group } : p)), { ...camera, group }],
  };
}

export const emptyScene = () => async (load) => {
  const { DEFAULT_PROJECT } = await load('/src/types/robotics.ts');

  return { name: 'Empty scene', parts: [], project: { ...DEFAULT_PROJECT }, annotations: [] };
};

export const fixtureScene =
  (id, { camera = false } = {}) =>
  async (load) => {
    const [{ DEFAULT_PROJECT }, { fixtureRobots }] = await Promise.all([
      load('/src/types/robotics.ts'),
      load('/src/sim/fixtures/robots.ts'),
    ]);
    const found = fixtureRobots().find((r) => r.id === id);
    const robot = camera ? withCamera(found) : found;

    return { name: id, parts: robot.parts, project: { ...DEFAULT_PROJECT, joints: robot.joints }, annotations: [] };
  };

const groupNames = (scene) => [...new Set((scene?.parts ?? []).map((p) => p.group?.name).filter(Boolean))];
const jointIds = (scene) => (scene?.project?.joints ?? []).map((j) => j.id);

export const named = (label, pattern) => ({
  label,
  test: (scene) => groupNames(scene).some((n) => pattern.test(n)) && jointIds(scene).length > 0,
  seen: (scene) => groupNames(scene).join(', ') || 'no robot',
});

export const kept = (label) => ({
  label,
  test: (scene, before) => jointIds(before).every((id) => jointIds(scene).includes(id)),
  seen: (scene) => `${jointIds(scene).length} joints`,
});

export const madeWith = (label, test) => ({ label, test, seen: (scene) => `${jointIds(scene).length} joints` });

export const robotCheck = (robot) =>
  check(`The scene ends with ${robot.label}`, ({ before, after }) => {
    const pass = robot.test(after, before);

    return { pass, detail: pass ? 'Yes' : robot.seen(after) };
  });

export function newCase({ before, after }) {
  const had = new Set((before?.project?.cases ?? []).map((c) => c.id));

  return (after?.project?.cases ?? []).filter((c) => !had.has(c.id)).at(-1) ?? null;
}

const options = (want) => (Array.isArray(want) ? want : [want]);

async function inputGaps(ctx, input, wanted) {
  const missing = [];
  const notBuilt = [];

  for (const want of wanted) {
    const ids = options(want);

    if (ids.some((id) => input.includes(id))) continue;

    const built = await Promise.all(ids.map((id) => ctx.adapters.inputBuilt(id)));

    (built.some(Boolean) ? missing : notBuilt).push(ids.join(' or '));
  }

  return { missing, notBuilt };
}

function panelGaps(console, wanted, input) {
  const missing = [];
  const notBuilt = [];

  for (const want of wanted) {
    if (console.panels.some((p) => want.test(p, console))) continue;

    (want.needs && !input.includes(want.needs) ? notBuilt : missing).push(want.label);
  }

  return { missing, notBuilt };
}

export const consoleCheck = ({ inputs = [], panels = [] }) =>
  check('The Case’s console has the inputs and panels named', async (ctx) => {
    const kase = newCase(ctx);

    if (!kase) return { pass: false, detail: 'No new Case' };

    if (!kase.console) return { pass: false, detail: 'The Case has no console' };

    const input = kase.console.input;
    const ins = await inputGaps(ctx, input, inputs);
    const outs = panelGaps(kase.console, panels, input);
    const missing = [...ins.missing, ...outs.missing];
    const notBuilt = [...ins.notBuilt, ...outs.notBuilt];

    if (missing.length) return { pass: false, detail: `Missing: ${missing.join(', ')}` };

    if (notBuilt.length) return { pass: null, detail: `Named, not built: ${notBuilt.join(', ')}`, notBuilt };

    return { pass: true, detail: `${input.join(', ')}; ${kase.console.panels.map((p) => p.kind).join(', ')}` };
  });

async function fitRows(ctx) {
  const kase = newCase(ctx);

  if (!kase) return null;

  if (!ctx.app) throw new AdapterMissing('caseFit', 'check_case_fit from the running app');

  ctx.fit ??= await ctx.app.call('check_case_fit', { id: kase.id });

  if (!ctx.fit?.ok) throw new AdapterMissing('caseFit', ctx.fit?.problem ?? 'check_case_fit rows');

  return ctx.fit.rows;
}

const row = (rows, id) => rows.find((r) => r.id === id);

export const fitsCheck = () =>
  check('The robot fits the Case (no slot refusal)', async (ctx) => {
    const rows = await fitRows(ctx);

    if (!rows) return { pass: false, detail: 'No new Case' };

    const slot = row(rows, 'slot');

    return { pass: slot?.state === 'pass', detail: slot?.detail ?? 'No slot row' };
  });

export const runsCheck = () =>
  check('The Case runs in the sim', async (ctx) => {
    const rows = await fitRows(ctx);

    if (!rows) return { pass: false, detail: 'No new Case' };

    const bad = rows.filter((r) => r.id !== 'slot' && r.state === 'fail');

    return {
      pass: !!row(rows, 'compile') && bad.length === 0,
      detail: bad.length ? bad.map((r) => `${r.label}: ${r.detail}`).join('; ') : 'Compiles and settles',
    };
  });

const OPERATOR_CAMERA = 'camera.operator';

export const cameraOf = (signal) => (p) =>
  p.kind === 'camera' && (p.signal === signal || (signal !== OPERATOR_CAMERA && p.signal === 'camera.*'));

const declared = (console, id, kind) => console.signals?.some((s) => s.id === id && s.kind === kind);

export const showsSignal = (kind) => (p, console) =>
  p.kind === 'value' && (declared(console, p.signal, kind) || (kind === 'timer' && p.signal === 'time'));

export const listOf = (of) => (p) => p.kind === 'list' && p.of === of;
