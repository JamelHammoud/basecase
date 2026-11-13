export const FAKE_DAEMON_SCRIPT = String.raw`
(() => {
  const LADDER = ['look', 'set_up', 'test', 'rehearse', 'first_run', 'policy', 'longer_runs'];
  const TICK_US = 20000;
  const STATUS_TICKS = 5;
  const SOFT_START_US = 300000;
  const QUIET_CALLS = 5;
  const LEAD_US = 40000;
  const SPEED_RAD_S = 0.5;
  const LAG_S = 0.3;
  const REACH = (SPEED_RAD_S * TICK_US) / 1e6;
  const LAG = 1 - Math.exp(-TICK_US / 1e6 / LAG_S);
  const G1_STANDING = [-0.1, 0, 0, 0.3, -0.2, 0, -0.1, 0, 0, 0.3, -0.2, 0];
  const G1_SPEC = { family: 'unitree-g1', ids: Array.from({ length: 17 }, (_, k) => k + 13), class: 'legged', emulated: true };
  const counts = (rad) => Math.round(2048 + (rad * 4096) / (2 * Math.PI));
  const listeners = new Set();
  const emit = (event) => listeners.forEach((l) => l(event));
  let robot = null;

  const isG1Ask = (spec) => spec && spec.family === 'unitree-g1' && spec.emulated === true && Object.keys(spec).length === 2;

  const layout = (spec) => {
    if (!isG1Ask(spec)) return { spec, ids: spec.ids, start: spec.ids.map(() => 0), writable: spec.ids.map((_, k) => k), lastRung: 'longer_runs' };
    const ids = Array.from({ length: 29 }, (_, k) => k + 1);
    const start = ids.map((id) => G1_STANDING[id - 1] ?? 0);
    return { spec: G1_SPEC, ids, start, writable: G1_SPEC.ids.map((id) => id - 1), lastRung: 'test' };
  };

  const wallUs = () => Math.round((performance.now() - robot.startedAt) * 1000);
  const driven = () => robot.quietCalls < QUIET_CALLS;
  const mix = (a, b, f) => a.map((v, k) => v + (b[k] - v) * f);

  const status = () => ({
    event: 'status',
    at_us: robot.atUs,
    mode: robot.mode,
    run: robot.run,
    sealed: false,
    fault_latched: false,
    joints: robot.ids.map((id, k) => ({
      id,
      position: counts(robot.position[k]),
      temp_c: 30,
      volts: 7.4,
      torque_on: robot.run === 'running' && robot.writable.includes(k),
      reply: 'ok',
    })),
  });

  const goalAt = (atUs) => {
    while (robot.queue.length && robot.queue[0].atUs <= atUs) {
      robot.prior = robot.held;
      robot.held = robot.queue.shift();
    }
    const { held, prior } = robot;
    const next = robot.queue[0];
    if (next?.joined) return mix(held.joints, next.joints, (atUs - held.atUs) / (next.atUs - held.atUs));
    if (next || !prior || !held.joined || !driven() || held.atUs === prior.atUs) return held.joints;
    return mix(prior.joints, held.joints, (atUs - prior.atUs) / (held.atUs - prior.atUs));
  };

  const tick = () => {
    robot.atUs += TICK_US;
    robot.ticks += 1;
    if (robot.run === 'soft_start' && robot.atUs >= robot.runningAtUs) robot.run = 'running';
    if (robot.run === 'running') {
      const held = goalAt(robot.atUs);
      robot.goal = robot.goal.map((g, k) => g + Math.max(-REACH, Math.min(REACH, held[k] - g)));
      robot.position = mix(robot.position, robot.goal, LAG);
    }
    if (robot.ticks % STATUS_TICKS === 0) emit(status());
  };

  const step = () => {
    robot.quietCalls += 1;
    const newest = robot.queue.at(-1) ?? robot.held;
    const until = driven() ? Math.min(wallUs(), newest.atUs + LEAD_US) : wallUs();
    while (robot.atUs + TICK_US <= until) tick();
  };

  const hold = (joints) => {
    robot.held = { atUs: robot.atUs, joints };
    robot.prior = null;
    robot.queue = [];
  };

  const intend = (joints) => {
    const atUs = Math.max(wallUs(), robot.atUs);
    robot.queue.push({ atUs, joints, joined: driven() });
    robot.quietCalls = 0;
  };

  const intent = (joints) => {
    if (!Array.isArray(joints) || joints.length !== robot.writable.length) return { ok: false, message: 'The robot only takes the documented commands.' };
    if (robot.run !== 'running') return { ok: true };
    const full = [...(robot.queue.at(-1) ?? robot.held).joints];
    robot.writable.forEach((k, i) => {
      if (typeof joints[i] !== 'number') return;
      full[k] = joints[i];
      robot.writes[robot.ids[k]] = (robot.writes[robot.ids[k]] ?? 0) + 1;
    });
    intend(full);
    return { ok: true };
  };

  const enter = (mode) => {
    const next = LADDER.indexOf(mode);
    if (next > LADDER.indexOf(robot.lastRung)) return emit({ event: 'refused', message: 'This robot stops at Test.' });
    if (mode !== 'look' && next !== LADDER.indexOf(robot.mode) + 1) return emit({ event: 'refused', message: 'One rung at a time.' });
    robot.mode = mode;
    robot.run = 'idle';
    emit({ event: 'mode', at_us: robot.atUs, mode });
    if (mode !== 'test') return;
    hold([...robot.position]);
    robot.goal = [...robot.position];
    robot.run = 'soft_start';
    robot.runningAtUs = robot.atUs + SOFT_START_US;
  };

  window.__fakeRobotLink = {
    onRobotEvent: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    robotState: async () => ({ connected: false, spec: null, hello: null, status: null }),
    robotConnect: async (ask) => {
      const { spec, ids, start, writable, lastRung } = layout(ask);
      robot = { ids, writable, lastRung, mode: 'look', run: 'idle', startedAt: performance.now(), atUs: 0, ticks: 0 };
      Object.assign(robot, { position: start, goal: start, quietCalls: QUIET_CALLS, writes: Object.fromEntries(ids.map((id) => [id, 0])) });
      hold(start);
      robot.timer = setInterval(step, TICK_US / 1000);
      emit({ event: 'link', state: 'connected', spec });
      emit({ event: 'hello', family: spec.family, emulated: true, real_transport: false, lost_message: 'Lost the emulated robot.' });
      return { ok: true };
    },
    robotCommand: async (command) => {
      if (!robot) return { ok: false, message: 'Connect an emulated robot first.' };
      if (command.cmd === 'enter') enter(command.mode);
      if (command.cmd === 'intent') return intent(command.joints);
      return { ok: true };
    },
    robotDisconnect: async () => {
      clearInterval(robot?.timer);
      robot = null;
      emit({ event: 'link', state: 'closed' });
      return { ok: true };
    },
    writes: () => ({ ...(robot?.writes ?? {}) }),
  };
})();
`;
