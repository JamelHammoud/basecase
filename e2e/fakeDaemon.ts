export const FAKE_DAEMON_SCRIPT = String.raw`
(() => {
  const LADDER = ['look', 'set_up', 'test', 'rehearse', 'first_run', 'policy', 'longer_runs'];
  const TICK_MS = 20;
  const STATUS_US = 100000;
  const SPEED_RAD_S = 0.5;
  const LAG_S = 0.3;
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

  const step = () => {
    const atUs = Math.round((performance.now() - robot.startedAt) * 1000);
    const dt = (atUs - robot.atUs) / 1e6;
    const reach = SPEED_RAD_S * dt;
    const lag = 1 - Math.exp(-dt / LAG_S);
    robot.atUs = atUs;
    if (robot.run === 'running') {
      robot.goal = robot.goal.map((g, k) => g + Math.max(-reach, Math.min(reach, robot.held[k] - g)));
      robot.position = robot.position.map((p, k) => p + (robot.goal[k] - p) * lag);
    }
    if (atUs - robot.statusAtUs < STATUS_US) return;
    robot.statusAtUs = atUs;
    emit(status());
  };

  const enter = (mode) => {
    const next = LADDER.indexOf(mode);
    if (next > LADDER.indexOf(robot.lastRung)) return emit({ event: 'refused', message: 'This robot stops at Test.' });
    if (mode !== 'look' && next !== LADDER.indexOf(robot.mode) + 1) return emit({ event: 'refused', message: 'One rung at a time.' });
    robot.mode = mode;
    robot.run = 'idle';
    emit({ event: 'mode', at_us: robot.atUs, mode });
    if (mode !== 'test') return;
    robot.held = [...robot.position];
    robot.goal = [...robot.position];
    robot.run = 'soft_start';
    setTimeout(() => (robot.run = 'running'), 300);
  };

  const intent = (joints) => {
    if (!Array.isArray(joints) || joints.length !== robot.writable.length) return { ok: false, message: 'The robot only takes the documented commands.' };
    if (robot.run !== 'running') return { ok: true };
    robot.held = [...robot.held];
    robot.writable.forEach((k, i) => {
      if (typeof joints[i] !== 'number') return;
      robot.held[k] = joints[i];
      robot.writes[robot.ids[k]] = (robot.writes[robot.ids[k]] ?? 0) + 1;
    });
    return { ok: true };
  };

  window.__fakeRobotLink = {
    onRobotEvent: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    robotState: async () => ({ connected: false, spec: null, hello: null, status: null }),
    robotConnect: async (ask) => {
      const { spec, ids, start, writable, lastRung } = layout(ask);
      robot = { ids, writable, lastRung, mode: 'look', run: 'idle', startedAt: performance.now(), atUs: 0, statusAtUs: 0 };
      Object.assign(robot, { position: start, goal: start, held: start, writes: Object.fromEntries(ids.map((id) => [id, 0])) });
      robot.timer = setInterval(step, TICK_MS);
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
