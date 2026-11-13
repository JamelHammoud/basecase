import { caseRunDetail } from './caseChecks.mjs';
import { check } from './checks.mjs';

const ids = (v) => (Array.isArray(v) ? v : [v]).filter((id) => typeof id === 'string');

function components(joints) {
  const root = new Map();
  const find = (id) => {
    if (!root.has(id)) root.set(id, id);

    const at = root.get(id);

    return at === id ? id : find(at);
  };

  for (const j of joints) {
    const [first, ...rest] = [...ids(j.parent), ...ids(j.child)];

    rest.forEach((id) => root.set(find(id), find(first)));
  }

  return find;
}

const CAMERA = /camera|cam\b|oak|realsense/i;

const groupName = (part) => (typeof part.group === 'string' ? part.group : part.group?.name);

export function robotsIn(scene) {
  const joints = scene?.project?.joints ?? [];
  const parts = new Map((scene?.parts ?? []).map((p) => [p.id, p]));
  const find = components(joints);
  const robots = new Map();

  for (const j of joints) {
    const key = find([...ids(j.parent), ...ids(j.child)][0]);
    const robot = robots.get(key) ?? { joints: 0, spinning: 0, names: [], camera: false };
    const linked = [...ids(j.parent), ...ids(j.child)].map((id) => parts.get(id)).filter(Boolean);

    robot.joints += 1;
    robot.spinning += j.range ? 0 : 1;
    robot.names = [...new Set([...robot.names, ...linked.map(groupName).filter(Boolean)])];
    robot.camera ||= linked.some((p) => CAMERA.test(`${p.componentId ?? ''} ${p.name ?? ''}`));
    robots.set(key, robot);
  }

  return [...robots.values()];
}

const named = (robot, re) => robot.names.some((n) => re.test(n));

export const ROBOTS = {
  g1: { label: 'a Unitree G1', fits: (r) => named(r, /\bG1\b/i) && r.joints >= 20 },
  arm: { label: 'an arm', plural: 'arms', fits: (r) => r.joints >= 4 && r.spinning === 0 },
  so101: { label: 'an SO-101', fits: (r) => named(r, /so-?101/i) && r.joints >= 5 },
  rover: { label: 'a rover', fits: (r) => r.spinning >= 2 },
  quadruped: { label: 'a quadruped', fits: (r) => r.joints >= 8 && r.spinning === 0 },
  panTilt: { label: 'a pan-tilt camera', fits: (r) => r.joints >= 2 && r.camera },
  hexapod: { label: 'a hexapod', fits: (r) => r.joints >= 12 && (named(r, /hex/i) || r.joints >= 18) },
  any: { label: 'a robot', fits: (r) => r.joints >= 2 },
};

export const rightRobot = (kind, count = 1) => {
  const want = ROBOTS[kind];

  return check(`The scene ends with ${count > 1 ? `${count} ${want.plural}` : want.label}`, (ctx) => {
    const robots = robotsIn(ctx.after);
    const fitting = robots.filter(want.fits).length;

    return {
      pass: fitting >= count,
      detail: robots.length
        ? `${fitting} of ${robots.length} robots fit (${robots.map((r) => `${r.joints} joints`).join(', ')})`
        : 'No robot',
    };
  });
};

export const consoleCase = (scene) => (scene?.project?.cases ?? []).filter((c) => c.console).at(-1) ?? null;

async function inputVerdict(ctx, wanted, given) {
  const alternatives = wanted.split('|');

  if (alternatives.some((id) => given.includes(id))) return 'ok';

  const built = await Promise.all(alternatives.map((id) => ctx.adapters.inputBuilt(ctx, id)));

  return built.some(Boolean) ? 'missing' : 'not built';
}

async function consoleGaps(ctx, kase, want) {
  const { input, panels, signals = [] } = kase.console;
  const verdicts = await Promise.all((want.inputs ?? []).map((w) => inputVerdict(ctx, w, input)));
  const inputsOf = (v) => (want.inputs ?? []).filter((_, i) => verdicts[i] === v);
  const lacking = (kinds, have) => kinds.filter((k) => !have.some((h) => h.kind === k));

  return {
    missing: [
      ...inputsOf('missing').map((id) => `input ${id}`),
      ...lacking(want.panels ?? [], panels).map((k) => `${k} panel`),
      ...lacking(want.signals ?? [], signals).map((k) => `${k} signal`),
    ],
    notBuilt: inputsOf('not built'),
  };
}

export const consoleHas = (want) =>
  check('The Case’s console has the right inputs and panels', async (ctx) => {
    const kase = consoleCase(ctx.after);

    if (!kase) return { pass: false, detail: 'No Case with a console' };

    const { missing, notBuilt } = await consoleGaps(ctx, kase, want);
    const said = kase.console.panels.map((p) => p.kind).join(', ');

    if (missing.length) return { pass: false, detail: `Lacks ${missing.join(', ')} (has ${said})` };

    if (notBuilt.length) return { pass: null, detail: `${notBuilt.join(', ')} named, not built`, adapter: 'input' };

    return { pass: true, detail: `${kase.console.input.join(', ')}; ${said}` };
  });

async function consoleRun(ctx) {
  const kase = consoleCase(ctx.after);

  if (!kase) return { problem: 'No Case with a console' };

  ctx.consoleRun ??= ctx.adapters.runCase(ctx, kase.id);

  return ctx.consoleRun;
}

export const robotFits = () =>
  check('The robot fits the Case', async (ctx) => {
    const run = await consoleRun(ctx);

    if (run.problem) return { pass: false, detail: run.problem };

    return run.refusal ? { pass: false, detail: run.refusal } : { pass: true, detail: 'No refusal' };
  });

export const runsInSim = () =>
  check('The Case runs in the sim', async (ctx) => {
    const run = await consoleRun(ctx);

    if (run.problem) return { pass: false, detail: run.problem };

    return { pass: run.runs > 0 && !run.refusal, detail: caseRunDetail(run) };
  });
