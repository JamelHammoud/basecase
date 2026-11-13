import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixtureRobot } from '../../sim/fixtures/parts';
import { fixtureRobots } from '../../sim/fixtures/robots';
import { readInputs } from '../../sim/inputSources';
import { openCodeBridge, SILENT_ERROR } from './codeBridge';
import { setCodeDrive } from './codeDrive';
import { BRIDGE_VERSION } from './codeProtocol';
import { fakeClock, openTestFrame, type FrameOptions, type TestFrame } from './fixtures/codeFrames';
import { createSignalBus, type SignalBus } from './signalBus';
import type { SignalScope } from './signalNames';

const robot = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const scope = (inputs: string[] = ['code']): SignalScope => ({
  declared: new Set(),
  probes: new Set(),
  inputs: new Set(inputs),
});

function busFor(fixture: FixtureRobot, time = 1, running = false): SignalBus {
  const bus = createSignalBus();

  bus.push(sampleOf(fixture, time, running));

  return bus;
}

const sampleOf = (fixture: FixtureRobot, time: number, running = false) => ({
  time,
  running,
  joints: fixture.joints.map((j, i) => ({ id: j.id, target: i, position: i + 0.5, effort: 0.1 * (i + 1) })),
  robot: { speed: 0.4, tilt: 3, height: 120, travelled: 0, x: 0, z: 0 },
  probes: {},
  inputs: {},
  goal: null,
  cameras: [],
});

const opened: TestFrame[] = [];
const stickOwner = {};

function open(html: string, o: FrameOptions) {
  const frame = openTestFrame(html, o);

  opened.push(frame);

  return frame;
}

afterEach(() => {
  opened.splice(0).forEach((f) => f.close());
  setCodeDrive(stickOwner, null);
});

const JOYSTICK = `<script>
const pad = document.createElement('canvas');
pad.dataset.pad = 'stick';
const g = pad.getContext('2d');
const send = (x, y) => basecase.drive({ v: [-y, 0, -x] });
pad.addEventListener('pointerdown', (e) => { basecase.action('drive'); send(e.x, e.y); });
pad.addEventListener('pointermove', (e) => { g.clearRect(0, 0, 200, 200); g.arc(100 + e.x * 80, 100 + e.y * 80, 24, 0, 6.28); send(e.x, e.y); });
pad.addEventListener('pointerup', () => basecase.drive(null));
document.body.append(pad);
</script>`;

const HUD = `<script>
const speed = document.createElement('div');
speed.dataset.hud = 'speed';
const tilt = document.createElement('div');
tilt.dataset.hud = 'tilt';
document.body.append(speed, tilt);
basecase.signals(['robot.speed', 'robot.tilt'], (v) => {
  speed.textContent = v['robot.speed'].toFixed(2) + ' m/s';
  tilt.textContent = v['robot.tilt'].toFixed(0) + '°';
});
</script>`;

const PUPPET = `<script>
const hand = [200, 150, 0];
['x', 'y', 'z'].forEach((axis, i) => {
  const slider = document.createElement('input');
  slider.dataset.axis = axis;
  slider.addEventListener('input', (e) => {
    hand[i] = Number(e.target.value);
    basecase.drive({ v: [0, 0, 0], target: [...hand] });
  });
  document.body.append(slider);
});
</script>`;

const PICTURES = `<script>
for (const move of ['wave', 'dance', 'sit', 'stop']) {
  const picture = document.createElement('button');
  picture.dataset.move = move;
  picture.addEventListener('click', () => basecase.event(move));
  document.body.append(picture);
}
</script>`;

const START = `<script>
const start = document.createElement('button');
start.dataset.button = 'start';
start.addEventListener('click', async () => {
  const reply = await basecase.action('try');
  start.textContent = reply.ok ? 'started' : reply.problem;
});
document.body.append(start);
</script>`;

const EFFORT_PLOT = `<script>
const plot = document.createElement('canvas');
plot.dataset.plot = 'effort';
const g = plot.getContext('2d');
document.body.append(plot);
basecase.signals('joint.*.effort', (values) => {
  g.clearRect(0, 0, 300, 120);
  Object.values(values).forEach((v, i) => g.lineTo(i * 40, 120 - v * 100));
  g.stroke();
});
</script>`;

const press = (frame: TestFrame, at: string, type: string, init = {}) => {
  const [key, value] = at.split('=');

  frame.body.find(key, value)!.dispatch(type, init);
};

const settle = () => new Promise((done) => setTimeout(done, 5));

describe('code panels through the bridge', () => {
  it('drives a rover from a joystick drawn on a canvas, as the code input source', async () => {
    const stick = open(JOYSTICK, { bus: busFor(robot('rover-diff')), scope: scope() });

    press(stick, 'pad=stick', 'pointerdown', { x: 0, y: -1 });
    press(stick, 'pad=stick', 'pointermove', { x: 0.5, y: -1 });
    await vi.waitFor(() => expect(stick.log.drives).toEqual([{ v: [1, 0, -0] }, { v: [1, 0, -0.5] }]));
    expect(stick.log.fired).toEqual(['drive']);
    expect(stick.body.find('pad', 'stick')!.calls).toContain('arc(140,20,24,0,6.28)');

    setCodeDrive(stickOwner, stick.log.drives.at(-1)!);

    const read = readInputs(['code', 'keys'], { cls: 'rover', keys: { v: [0, 0, 0] } });

    expect(read.command).toEqual({ v: [1, 0, -0.5] });

    press(stick, 'pad=stick', 'pointerup');
    await vi.waitFor(() => expect(stick.log.drives.at(-1)).toBeNull());
  });

  it('shows a HUD from robot.speed and robot.tilt, sending only the signals it asked for', async () => {
    const bus = busFor(robot('rover-diff'));
    const hud = open(HUD, { bus, scope: scope() });

    await vi.waitFor(() => expect(hud.body.find('hud', 'speed')!.textContent).toBe('0.40 m/s'));
    expect(hud.body.find('hud', 'tilt')!.textContent).toBe('3°');
  });

  it('moves an arm’s hand target from a body-shaped slider puppet', async () => {
    const puppet = open(PUPPET, { bus: busFor(robot('arm-6dof')), scope: scope() });
    const slide = (axis: string, value: number) => press(puppet, `axis=${axis}`, 'input', { target: { value } });

    slide('x', 180);
    slide('y', 220);
    await vi.waitFor(() => expect(puppet.log.drives.at(-1)).toEqual({ v: [0, 0, 0], target: [180, 220, 0] }));
  });

  it('sends wave, dance, sit and stop from four picture buttons', async () => {
    const pictures = open(PICTURES, { bus: busFor(robot('quad-servo')), scope: scope() });

    for (const move of ['wave', 'dance', 'sit', 'stop']) press(pictures, `move=${move}`, 'click');

    await vi.waitFor(() =>
      expect(pictures.log.events).toEqual([
        ['wave', true],
        ['dance', true],
        ['sit', true],
        ['stop', true],
      ]),
    );
  });

  it('starts a try from a Start button, and refuses it while a try runs', async () => {
    let trying = false;
    const panel = open(START, {
      bus: busFor(robot('arm-3dof')),
      scope: scope(),
      can: (action) => action === 'try' && !trying,
    });
    const start = panel.body.find('button', 'start')!;

    start.dispatch('click');
    await vi.waitFor(() => expect(start.textContent).toBe('started'));
    trying = true;
    start.dispatch('click');
    await vi.waitFor(() => expect(start.textContent).toBe('try can’t run now'));
    expect(panel.log.fired).toEqual(['try']);
    expect(panel.bridge.errors()).toEqual(['action refused: try can’t run now']);
  });

  it('draws a plot from joint.*.effort, at most 20 times a second', async () => {
    const arm = robot('arm-3dof');
    const clock = fakeClock();
    const bus = busFor(arm);
    const panel = open(EFFORT_PLOT, { bus, scope: scope(), clock });
    const plot = panel.body.find('plot', 'effort')!;

    await vi.waitFor(() => expect(plot.calls.filter((c) => c === 'stroke()')).toHaveLength(1));
    expect(plot.calls.filter((c) => c.startsWith('lineTo'))).toHaveLength(arm.joints.length);

    for (let i = 1; i <= 10; i++) {
      clock.tick(10);
      bus.push(sampleOf(arm, 1 + i * 0.01));
    }

    await vi.waitFor(() => expect(plot.calls.filter((c) => c === 'stroke()')).toHaveLength(3));
    clock.tick(49);
    await settle();
    expect(plot.calls.filter((c) => c === 'stroke()')).toHaveLength(3);
    clock.tick(1);
    await vi.waitFor(() => expect(plot.calls.filter((c) => c === 'stroke()')).toHaveLength(4));
  });

  it('refuses signals that don’t exist and drive when the console doesn’t list code', async () => {
    const panel = open(
      `<script>basecase.signals(['robot.mood'], () => {}); basecase.drive({ v: [1, 0, 0] });</script>`,
      {
        bus: busFor(robot('rover-diff')),
        scope: scope(['keys']),
        inputs: ['keys'],
      },
    );

    await vi.waitFor(() =>
      expect(panel.bridge.errors()).toEqual([
        'signals refused: robot.mood must be robot.height or tilt or speed or travelled or x or z',
        'drive refused: the console’s input doesn’t list code',
      ]),
    );
    expect(panel.log.drives).toEqual([]);
  });
});

describe('the bridge’s guards', () => {
  it('passes Esc and ⌘K to the studio and nothing else', async () => {
    const panel = open('', { bus: busFor(robot('rover-diff')), scope: scope() });

    for (const key of [{ key: 'w' }, { key: 'Escape' }, { key: 'k', metaKey: true }, { key: 'k' }])
      panel.fire('keydown', { metaKey: false, ctrlKey: false, shiftKey: false, ...key });

    await vi.waitFor(() =>
      expect(panel.log.keys).toEqual([
        { key: 'Escape', meta: false, ctrl: false, shift: false },
        { key: 'k', meta: true, ctrl: false, shift: false },
      ]),
    );
  });

  it('unloads a panel that stops answering the heartbeat for 2 s', async () => {
    const clock = fakeClock();
    const healthy = open('', { bus: busFor(robot('rover-diff')), scope: scope(), clock });
    const hung = open(JOYSTICK, { bus: busFor(robot('rover-diff')), scope: scope(), clock });

    hung.hang();

    for (let i = 0; i < 8; i++) {
      clock.tick(500);
      await settle();
    }

    expect(healthy.log.failed).toEqual([]);
    expect(hung.log.failed).toEqual([SILENT_ERROR]);
    expect(hung.log.drives).toEqual([null]);
  });

  it('pings again after the page stalls, and unloads only a panel that misses that ping too', async () => {
    const clock = fakeClock();
    const healthy = open('', { bus: busFor(robot('rover-diff')), scope: scope(), clock });
    const hung = open(JOYSTICK, { bus: busFor(robot('rover-diff')), scope: scope(), clock });

    await settle();
    hung.hang();
    clock.tick(500);
    clock.freeze(5000);
    await settle();

    expect(healthy.log.failed).toEqual([]);
    expect(hung.log.failed).toEqual([]);

    clock.freeze(5000);
    await settle();

    expect(healthy.log.failed).toEqual([]);
    expect(hung.log.failed).toEqual([SILENT_ERROR]);
  });

  it('gives the frame 10 s to say hello before it unloads it', () => {
    const clock = fakeClock();
    const failed: string[] = [];
    const bridge = openCodeBridge({
      frame: () => null,
      bus: busFor(robot('rover-diff')),
      scope: scope(),
      inputs: ['code'],
      studio: {
        drive: () => undefined,
        event: () => undefined,
        can: () => true,
        fire: () => undefined,
        key: () => undefined,
        world: () => null,
        frames: () => () => undefined,
        store: { get: () => null, set: () => undefined },
      },
      onFail: (error) => failed.push(error),
      clock,
    });

    clock.tick(9_500);
    expect(failed).toEqual([]);
    clock.tick(500);
    expect(failed).toEqual([SILENT_ERROR]);
    bridge.close();
  });

  it('fails a panel whose script throws while it loads, with the first error', async () => {
    const panel = open('<script>throw new Error("no piano here")</script><script>throw new Error("later")</script>', {
      bus: busFor(robot('rover-diff')),
      scope: scope(),
    });

    await vi.waitFor(() => expect(panel.log.failed).toEqual(['no piano here']));
  });

  it('refuses malformed calls and keeps them per panel', async () => {
    const panel = open(
      `<script>
        basecase.drive({ v: [9, 0, 0] });
        basecase.event('no spaces allowed', 1);
        basecase.action('launch');
      </script>`,
      { bus: busFor(robot('rover-diff')), scope: scope() },
    );

    await vi.waitFor(() =>
      expect(panel.bridge.errors()).toEqual([
        'sent a malformed drive message',
        'sent a malformed event message',
        'action refused: launch is no action',
      ]),
    );
  });

  it('ignores a bridge hello from another frame and a port from anyone but the studio', async () => {
    const bus = busFor(robot('rover-diff'));
    const panel = open(PICTURES, { bus, scope: scope() });
    const stranger = { postMessage: vi.fn() };

    panel.bridge.receive({ source: stranger, data: { bc: BRIDGE_VERSION, type: 'hello' } });
    panel.bridge.receive({ source: stranger, data: { type: 'event', name: 'dance', value: true } });
    expect(stranger.postMessage).not.toHaveBeenCalled();

    const spoofed = new MessageChannel();

    (panel.window.postMessage as (d: unknown, o: object) => void)(
      { bc: BRIDGE_VERSION, type: 'port' },
      { transfer: [spoofed.port2] },
    );
    spoofed.port1.onmessage = vi.fn();
    press(panel, 'move=sit', 'click');
    await settle();
    await vi.waitFor(() => expect(panel.log.events).toEqual([['sit', true]]));
    expect(spoofed.port1.onmessage).not.toHaveBeenCalled();
    spoofed.port1.close();
  });
});
