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
  const COUNTS_PER_RAD = 4096 / (2 * Math.PI);
  const counts = (rad) => Math.round(2048 + rad * COUNTS_PER_RAD);
  const isServoSpec = (spec) => spec.family === 'feetech' || spec.family === 'dynamixel';
  const hornOf = (id) => link.horns[id] ?? { offsetDeg: 0, direction: 1 };
  const linkRad = (id, position) => {
    const horn = hornOf(id);
    return (horn.direction * (counts(position) - 2048 - (horn.offsetDeg * 4096) / 360)) / COUNTS_PER_RAD;
  };
  const shaftOf = (k, rad) => {
    const mount = robot.calibration[k];
    return (mount.zero_counts - 2048) / COUNTS_PER_RAD + mount.direction * rad;
  };
  const mountsEvent = () => ({ event: 'calibration', joints: robot.ids.map((id, k) => ({ id, ...robot.calibration[k] })) });
  const listeners = new Set();
  const emit = (event) => listeners.forEach((l) => l(event));
  let robot = null;

  const isG1Ask = (spec) => spec && spec.family === 'unitree-g1' && spec.emulated === true && Object.keys(spec).length === 2;

  const isRos2Ask = (spec) => spec && spec.family === 'ros2' && spec.emulated === true && Array.isArray(spec.joints);

  const ros2Layout = (ask) => {
    const ids = ask.joints.map((_, k) => k + 1);
    const spec = { family: 'ros2', ids, class: 'arm', emulated: true, controller: { ...ask.controller }, joints: [...ask.joints] };
    return { spec, ids, start: ids.map(() => 0), writable: ids.map((_, k) => k), lastRung: 'test' };
  };

  const layout = (spec) => {
    if (isRos2Ask(spec)) return ros2Layout(spec);
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
    joints: robot.ids.map((id, k) =>
      holds(id)
        ? { id, position: counts(robot.position[k]), temp_c: robot.servos ? 30 : null, volts: robot.servos ? 7.4 : null, torque_on: robot.run === 'running' && robot.writable.includes(k) && id !== robot.stalled, reply: 'ok', ...(robot.mounted ? { link_rad: linkRad(id, robot.position[k]) } : {}) }
        : { id, position: null, temp_c: null, volts: null, torque_on: null, reply: 'missing' },
    ),
  });

  const holds = (id) => robot.bus.some((servo) => servo.id === id);
  const isNew = (servo) => servo.id === 1 || !robot.ids.includes(servo.id);
  const refuse = (message) => emit({ event: 'refused', message });

  const assignId = (id) => {
    if (robot.mode !== 'set_up') return refuse('Enter Set Up first.');
    const fresh = robot.bus.filter(isNew);
    if (fresh.length === 0) return refuse('No new servo answers.');
    if (fresh.length > 1) return refuse('More than one new servo answers.');
    if (robot.bus.some((servo) => servo.id === id && servo !== fresh[0])) return refuse('ID ' + id + ' is already taken.');
    fresh[0].id = id;
    emit({ event: 'assigned', at_us: robot.atUs, id });
  };

  const plugIn = () => {
    if (!robot?.plugRequested) return false;
    robot.plugRequested = false;
    robot.bus.push({ id: 1 });
    return true;
  };

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
      robot.position = mix(robot.position, robot.goal, LAG).map((p, k) => (robot.ids[k] === robot.stalled ? robot.position[k] : p));
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
    link.intents.push([...joints]);
    const full = [...(robot.queue.at(-1) ?? robot.held).joints];
    robot.writable.forEach((k, i) => {
      if (typeof joints[i] !== 'number') return;
      full[k] = robot.mounted ? shaftOf(k, joints[i]) : joints[i];
      robot.writes[robot.ids[k]] = (robot.writes[robot.ids[k]] ?? 0) + 1;
    });
    intend(full);
    return { ok: true };
  };

  const plantStall = (id) => {
    robot.stalled = id;
    emit({ event: 'fault', at_us: robot.atUs, code: 'stall', id, message: 'The joint on servo ' + id + ' is stuck: its motor is pushing but nothing moves. Its motor was switched off.' });
    return true;
  };

  const enter = (mode) => {
    const next = LADDER.indexOf(mode);
    if (next > LADDER.indexOf(robot.lastRung)) return refuse('This robot stops at Test.');
    const again = mode === 'test' && robot.mode === 'test';
    if (mode !== 'look' && !again && next !== LADDER.indexOf(robot.mode) + 1) return refuse('One rung at a time.');
    if (next >= LADDER.indexOf('rehearse') && !link.policy.length) return refuse('Load a policy first.');
    const silent = robot.ids.find((id) => !holds(id));
    if (mode === 'test' && silent !== undefined) return refuse('Servo ' + silent + " doesn't answer.");
    robot.mode = mode;
    robot.run = 'idle';
    emit({ event: 'mode', at_us: robot.atUs, mode });
    if (mode !== 'test') return;
    hold([...robot.position]);
    robot.goal = [...robot.position];
    robot.run = 'soft_start';
    robot.runningAtUs = robot.atUs + SOFT_START_US;
  };

  const calibrate = (joints) => {
    if (!robot?.mounted) return { ok: false, message: 'The robot only takes the documented commands.' };
    const known = Array.isArray(joints) && joints.every((j) => robot.ids.includes(j.id) && Number.isInteger(j.zero_counts) && Math.abs(j.direction) === 1);
    if (!known) return { ok: false, message: 'The robot only takes the documented commands.' };
    joints.forEach((j) => (robot.calibration[robot.ids.indexOf(j.id)] = { zero_counts: j.zero_counts, direction: j.direction }));
    link.written = JSON.parse(JSON.stringify(mountsEvent().joints));
    emit(mountsEvent());
    if (robot.run === 'running' || robot.run === 'soft_start') {
      robot.run = 'idle';
      emit({ event: 'mode', at_us: robot.atUs, mode: robot.mode });
    }
    return { ok: true };
  };

  const link = (window.__fakeRobotLink = {
    factory: false,
    horns: {},
    written: null,
    policy: [],
    lastAsk: null,
    intents: [],
    asked: () => link.lastAsk,
    plugIn,
    plantStall: (id) => (robot ? plantStall(id) : false),
    onRobotEvent: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    robotState: async () => ({ connected: false, spec: null, hello: null, status: null, calibration: link.written }),
    robotCalibrate: async (joints) => calibrate(joints),
    robotPolicy: async (refs) => {
      link.policy = refs;
      return { ok: true };
    },
    robotConnect: async (ask) => {
      const { spec, ids, start, writable, lastRung } = layout(ask);
      robot = { ids, writable, lastRung, servos: spec.family !== 'ros2', mounted: isServoSpec(spec), mode: 'look', run: 'idle', startedAt: performance.now(), atUs: 0, ticks: 0, stalled: null };
      robot.calibration = ids.map(() => ({ zero_counts: 2048, direction: 1 }));
      link.written = robot.mounted ? mountsEvent().joints : null;
      link.intents = [];
      link.lastAsk = JSON.parse(JSON.stringify(ask));
      const factory = ask.factory === true || link.factory === true;
      robot.bus = factory ? [] : ids.map((id) => ({ id }));
      robot.plugRequested = false;
      Object.assign(robot, { position: start, goal: start, quietCalls: QUIET_CALLS, writes: Object.fromEntries(ids.map((id) => [id, 0])) });
      hold(start);
      robot.timer = setInterval(step, TICK_US / 1000);
      emit({ event: 'link', state: 'connected', spec });
      emit({ event: 'hello', family: spec.family, emulated: true, real_transport: false, lost_message: 'Lost the emulated robot.' });
      if (robot.mounted) emit(mountsEvent());
      return { ok: true };
    },
    robotCommand: async (command) => {
      if (!robot) return { ok: false, message: 'Connect an emulated robot first.' };
      if (command.cmd === 'enter') enter(command.mode);
      if (command.cmd === 'assign_id') assignId(command.id);
      if (command.cmd === 'plug_in' && robot.bus.length < robot.ids.length) robot.plugRequested = true;
      if (command.cmd === 'intent') return intent(command.joints);
      return { ok: true };
    },
    robotDisconnect: async () => {
      clearInterval(robot?.timer);
      robot = null;
      link.horns = {};
      emit({ event: 'link', state: 'closed' });
      return { ok: true };
    },
    writes: () => ({ ...(robot?.writes ?? {}) }),
  });
})();
`;
