import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { saluteMotion, wave } from '../src/cameras/gestures/fixtures/gestures';
import { faceOffCentre } from '../src/cameras/operator/fixtures/faceOffCentre';
import { handMovesRight } from '../src/cameras/operator/fixtures/handMovesRight';
import { panTilt, PAN_JOINT } from '../src/cameras/operator/fixtures/panTilt';
import type { PoseSample } from '../src/cameras/operator/poseFollow';
import { CASE_FORMAT_VERSION } from '../src/cases/schema';
import { SONG_BYTES, SONG_NOTES } from '../src/midi/fixtures/song';
import type { FixtureRobot } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { bytesToBase64 } from '../src/utils/base64';
import { g1Humanoid } from './g1Fixture';
import { FAKE_CAMERA, openApp, openPlayTab, partCount, shown, type App } from './harness';
import { HEARD_WORD, puppetScene, sitScene } from './inputCases';
import { connectPhone, type PhoneSocket } from './phoneClient';

interface SimState {
  drive: string;
  activeCase: string | null;
  stats: { robots: Array<{ forward: number }> } | null;
  effector: number[] | null;
  joints: Record<string, { target: number; position: number }>;
}

type Phone = { status: 'off' } | { status: 'pairing'; url: string; token: string; cert: string } | { status: string };

interface InputEvent {
  name: string;
  value: string | number | boolean;
}

interface StudioWindow {
  __studio: {
    load: (record: unknown) => void;
    simState: () => SimState;
    phone: () => Phone;
    driveWith: (inputs: string[]) => Promise<boolean>;
    feedHand: (samples: unknown[]) => void;
    feedFace: (samples: unknown[]) => void;
    dropFiles: (files: Array<{ name: string; base64: string }>) => void;
    inputEvents: () => InputEvent[];
    feedVoice: (samples: number[], sampleRate: number) => void;
    addCase: (raw: unknown) => string;
    feedPose: (samples: PoseSample[]) => void;
    operatorCamera: () => { feeding: boolean };
  };
}

interface Clip {
  samples: Float32Array;
  sampleRate: number;
}

const importModule = (name: string) => import(/* @vite-ignore */ name);
const { readWav } = (await importModule(new URL('../src/voice/voskNodeHost.mjs', import.meta.url).href)) as {
  readWav: (file: URL) => Clip;
};

interface Scene {
  name: string;
  parts: unknown[];
  project: { joints?: unknown[]; cases?: Array<{ id: string; name: string }> };
}

const WATCH_CAMERA = {
  formatVersion: CASE_FORMAT_VERSION,
  id: 'watch-the-camera',
  name: 'Watch the Camera',
  brief: 'Wave back.',
  slot: { needs: [], binding: {} },
  world: { objects: [] },
  controls: [],
  reference: { timeline: [] },
  task: {
    seconds: 30,
    probes: [],
    contract: {
      version: 1,
      success: {
        eventually: { window: 'whole', state: { atom: { expr: { signal: 'elapsed' }, cmp: '>', value: 1, scale: 1 } } },
      },
      failures: [],
    },
  },
};

const TILT_HZ = 30;
const HAND_MOVED_MM = 10;
const FACE_TURNED_DEG = 10;
const SETTLED_DEG = 2;

let app: App;

const studio = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.simState());

const phoneState = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.phone());

const inputEvents = () => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.inputEvents());

const driveWith = (inputs: string[]) =>
  app.page.evaluate((ids) => (window as unknown as StudioWindow).__studio.driveWith(ids), inputs);

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const sceneOf = (robot: FixtureRobot): Scene => ({
  name: robot.id,
  parts: robot.parts,
  project: { ...DEFAULT_PROJECT, joints: robot.joints },
});

async function load(scene: Scene) {
  await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), scene);
  await expect.poll(() => partCount(app.page)).toBe(scene.parts.length);
}

const panel = (id: string) => app.page.locator(shown(`[data-panel="${id}"]`));

const areaCount = () => app.page.locator(shown('[data-testid="case-run-area"]')).count();

async function runCase(scene: Scene) {
  const kase = scene.project.cases![0];

  await load(scene);
  await openPlayTab(app.page, 'Cases');
  await app.page.locator(shown('[data-testid="cases-panel"] button'), { hasText: kase.name }).first().click();
  await expect.poll(async () => (await studio()).activeCase).toBe(kase.id);
  await command('Run Case');
  await expect.poll(areaCount).toBe(2);
}

async function tryIt() {
  await panel('go').locator('button', { hasText: 'Try It' }).first().click();
  await expect.poll(async () => (await studio()).drive, { timeout: 60000 }).toBe('on');
}

async function leaveCase() {
  await stopDriving();
  await app.page.keyboard.press('Escape');
  await expect.poll(areaCount).toBe(0);
}

const feedPose = (samples: PoseSample[]) =>
  app.page.evaluate((s) => (window as unknown as StudioWindow).__studio.feedPose(s), samples);

const fed = () =>
  expect
    .poll(() => app.page.evaluate(() => (window as unknown as StudioWindow).__studio.operatorCamera().feeding), {
      timeout: 60000,
    })
    .toBe(false);

const gestures = async () => (await inputEvents()).filter((e) => e.name === 'gesture').map((e) => e.value);

const teachSheet = (phase: string, taught: number) =>
  app.page.locator(`[data-testid="teach-gesture"][data-phase="${phase}"][data-taught="${taught}"]`);

async function command(label: string) {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type(label);
  await app.page.locator(shown('button[data-idx="0"]'), { hasText: label }).waitFor();
  await app.page.keyboard.press('Enter');
}

async function startDriving() {
  await app.page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
  await app.page
    .locator(shown('button'), { hasText: /^Drive$/ })
    .first()
    .click();
  await expect.poll(async () => (await studio()).drive, { timeout: 60000 }).toBe('on');
}

async function stopDriving() {
  if ((await studio()).drive === 'off') return;

  await app.page.mouse.click(720, 450);
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await studio()).drive).toBe('off');
}

beforeAll(async () => {
  app = await openApp({}, ['phone-'], { args: FAKE_CAMERA });
}, 120000);

afterEach(async () => {
  await stopDriving();
});

afterAll(async () => {
  await app?.close();
});

describe('live inputs', () => {
  it('pairs a phone from ⌘K and drives a rover by its tilt, and refuses the phone after Unpair Phone', async () => {
    await load(sceneOf(fixture('rover-diff')));
    await command('Pair Phone');
    await expect.poll(() => app.page.getByTestId('phone-qr').count()).toBe(1);

    const pairing = await phoneState();

    if (!('url' in pairing)) throw new Error('Pair Phone should start pairing.');

    const socket: PhoneSocket = await connectPhone(pairing.url, { ca: pairing.cert });

    await expect.poll(async () => (await phoneState()).status).toBe('connected');
    expect(await app.page.getByTestId('phone-qr').count()).toBe(0);
    await startDriving();

    const tilt = setInterval(
      () => socket.send(JSON.stringify({ tilt: [-20, 0], pad: null, buttons: [false, false] })),
      1000 / TILT_HZ,
    );

    try {
      await expect
        .poll(async () => (await studio()).stats?.robots[0].forward ?? 0, { timeout: 30000 })
        .toBeGreaterThan(0.1);
    } finally {
      clearInterval(tilt);
    }

    await stopDriving();
    await command('Unpair Phone');
    await socket.closed;
    await expect.poll(async () => (await phoneState()).status).toBe('off');
    await expect(connectPhone(pairing.url, { ca: pairing.cert })).rejects.toMatchObject({ code: 'ECONNREFUSED' });
    expect(app.errors).toEqual([]);
  });

  it('moves a fixed arm’s hand right with a recorded hand once a Case naming hand starts a try', async () => {
    await runCase(puppetScene(fixture('arm-6dof')));
    await app.page.evaluate(
      (samples) => (window as unknown as StudioWindow).__studio.feedHand(samples),
      handMovesRight(),
    );
    await tryIt();
    await expect.poll(() => panel('operator').locator('[data-camera="operator"]').count()).toBe(1);

    let leftmost = Infinity;
    const movedRight = async () => {
      const x = (await studio()).effector?.[0];

      if (x === undefined) return 0;

      leftmost = Math.min(leftmost, x);

      return x - leftmost;
    };

    await expect.poll(movedRight, { timeout: 30000 }).toBeGreaterThan(HAND_MOVED_MM);
    await leaveCase();
    expect(app.errors).toEqual([]);
  });

  it('turns a pan-tilt’s pan joint toward an off-centre face', async () => {
    await load(panTilt());
    await app.page.evaluate(
      (samples) => (window as unknown as StudioWindow).__studio.feedFace(samples),
      faceOffCentre(),
    );
    expect(await driveWith(['face'])).toBe(true);
    await expect
      .poll(async () => Math.abs((await studio()).joints[PAN_JOINT]?.target ?? 0), { timeout: 30000 })
      .toBeGreaterThan(FACE_TURNED_DEG);
    await expect
      .poll(
        async () => {
          const pan = (await studio()).joints[PAN_JOINT];

          return Math.abs(pan.target - pan.position);
        },
        { timeout: 30000 },
      )
      .toBeLessThan(SETTLED_DEG);
    expect(app.errors).toEqual([]);
  });

  it('plays a dropped MIDI file’s notes and sweep as named events on the sim clock', async () => {
    await load(sceneOf(fixture('rover-diff')));
    await app.page.evaluate(
      (base64) => (window as unknown as StudioWindow).__studio.dropFiles([{ name: 'song.mid', base64 }]),
      bytesToBase64(SONG_BYTES),
    );
    expect(await driveWith(['midi', 'keys'])).toBe(true);

    const notes = async () => [...new Set((await inputEvents()).filter((e) => e.name === 'midi').map((e) => e.value))];

    await expect.poll(notes, { timeout: 30000 }).toEqual(SONG_NOTES.map((n) => n.note));
    await expect
      .poll(async () => (await inputEvents()).filter((e) => e.name === 'midi.cc.1').at(-1)?.value, { timeout: 30000 })
      .toBe(1);
    expect(app.errors).toEqual([]);
  });

  it('hears a recorded “sit” in a Case whose logic listens for it', async () => {
    const { samples, sampleRate } = readWav(new URL('../src/voice/fixtures/sit.wav', import.meta.url));

    await runCase(sitScene(fixture('rover-diff')));
    await app.page.evaluate(
      (clip) => (window as unknown as StudioWindow).__studio.feedVoice(clip.samples, clip.sampleRate),
      { samples: Array.from(samples), sampleRate },
    );
    await tryIt();
    await expect
      .poll(async () => (await inputEvents()).filter((e) => e.name === 'voice').map((e) => e.value), {
        timeout: 30000,
      })
      .toEqual([HEARD_WORD]);
    await leaveCase();
    expect(app.errors).toEqual([]);
  });
});

describe('gestures', () => {
  it('fires one wave event for a wave, and fires a gesture taught from three examples', async () => {
    const g1 = g1Humanoid();

    await app.page.evaluate((record) => (window as unknown as StudioWindow).__studio.load(record), g1);
    await expect.poll(() => partCount(app.page), { timeout: 10000 }).toBe(g1.parts.length);
    await app.page.evaluate((raw) => (window as unknown as StudioWindow).__studio.addCase(raw), WATCH_CAMERA);

    await feedPose(wave({ waveS: 3 }));
    await command('Drive with Camera');
    await fed();
    expect(await gestures()).toEqual(['wave']);

    await command('Teach Gesture');
    await app.page.getByRole('textbox', { name: 'Name' }).fill('salute');
    await app.page.keyboard.press('Enter');

    for (let i = 0; i < 3; i++) {
      await teachSheet('recording', i).waitFor({ timeout: 15000 });
      await feedPose(saluteMotion(i));
      await fed();
      await (i < 2 ? teachSheet('countdown', i + 1) : app.page.getByTestId('teach-gesture')).waitFor({
        state: i < 2 ? 'visible' : 'detached',
        timeout: 15000,
      });
    }

    await feedPose(saluteMotion(3));
    await fed();
    expect(await gestures()).toEqual(['wave', 'salute']);
    expect(app.errors).toEqual([]);
  });
});
