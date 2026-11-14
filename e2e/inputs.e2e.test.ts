import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { faceOffCentre } from '../src/cameras/operator/fixtures/faceOffCentre';
import { handMovesRight } from '../src/cameras/operator/fixtures/handMovesRight';
import { panTilt, PAN_JOINT } from '../src/cameras/operator/fixtures/panTilt';
import { SONG_BYTES, SONG_NOTES } from '../src/midi/fixtures/song';
import type { FixtureRobot } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { bytesToBase64 } from '../src/utils/base64';
import { FAKE_CAMERA, openApp, partCount, shown, type App } from './harness';
import { connectPhone, type PhoneSocket } from './phoneClient';

interface SimState {
  drive: string;
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
    feedVoice: (samples: number[], sampleRate: number, words: string[]) => void;
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
  project: unknown;
}

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

  it('moves a fixed arm’s hand right with a recorded hand from the camera', async () => {
    await load(sceneOf(fixture('arm-6dof')));
    await app.page.evaluate(
      (samples) => (window as unknown as StudioWindow).__studio.feedHand(samples),
      handMovesRight(),
    );
    expect(await driveWith(['hand'])).toBe(true);

    let leftmost = Infinity;
    const movedRight = async () => {
      const x = (await studio()).effector?.[0];

      if (x === undefined) return 0;

      leftmost = Math.min(leftmost, x);

      return x - leftmost;
    };

    await expect.poll(movedRight, { timeout: 30000 }).toBeGreaterThan(HAND_MOVED_MM);
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

  it('hears a recorded “sit” as the voice event', async () => {
    const { samples, sampleRate } = readWav(new URL('../src/voice/fixtures/sit.wav', import.meta.url));

    await load(sceneOf(fixture('rover-diff')));
    await app.page.evaluate(
      (clip) => (window as unknown as StudioWindow).__studio.feedVoice(clip.samples, clip.sampleRate, ['sit']),
      { samples: Array.from(samples), sampleRate },
    );
    expect(await driveWith(['voice', 'keys'])).toBe(true);
    await expect
      .poll(async () => (await inputEvents()).filter((e) => e.name === 'voice').map((e) => e.value), {
        timeout: 30000,
      })
      .toEqual(['sit']);
    expect(app.errors).toEqual([]);
  });
});
