export const FAKE_DAEMON_SCRIPT = String.raw`
(() => {
  const LADDER = ['look', 'set_up', 'test', 'rehearse', 'first_run', 'policy', 'longer_runs'];
  const TICK_MS = 20;
  const STATUS_US = 100000;
  const SPEED_RAD_S = 0.5;
  const LAG_S = 0.3;
  const counts = (rad) => Math.round(2048 + (rad * 4096) / (2 * Math.PI));
  const listeners = new Set();
  const emit = (event) => listeners.forEach((l) => l(event));
  let robot = null;

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
      torque_on: robot.run === 'running',
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

  window.__fakeRobotLink = {
    onRobotEvent: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    robotState: async () => ({ connected: false, spec: null, hello: null, status: null }),
    robotConnect: async (spec) => {
      const zeros = spec.ids.map(() => 0);
      robot = { ids: spec.ids, mode: 'look', run: 'idle', startedAt: performance.now(), atUs: 0, statusAtUs: 0 };
      Object.assign(robot, { position: zeros, goal: zeros, held: zeros });
      robot.timer = setInterval(step, TICK_MS);
      emit({ event: 'link', state: 'connected', spec });
      emit({ event: 'hello', emulated: true, real_transport: false, lost_message: 'Lost the emulated robot.' });
      return { ok: true };
    },
    robotCommand: async (command) => {
      if (!robot) return { ok: false, message: 'Connect an emulated robot first.' };
      if (command.cmd === 'enter') enter(command.mode);
      if (command.cmd === 'intent' && robot.run === 'running') robot.held = command.joints;
      return { ok: true };
    },
    robotDisconnect: async () => {
      clearInterval(robot?.timer);
      robot = null;
      emit({ event: 'link', state: 'closed' });
      return { ok: true };
    },
  };
})();
`;
