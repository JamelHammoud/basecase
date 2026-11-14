import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import type { CodeFrameRequest, OpenCodeFrames } from '../../cameras/codeFrameTypes';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { V3 } from '../../utils/kinematics';
import { CASE_FORMAT_VERSION, type Case } from '../schema';
import { liveCodeTry, STEP_S, type LiveRun } from './fixtures/liveCode';

const BALL: V3 = [90, 380, 320];
const BALL_MM = 25;
const FOV = Math.PI / 3;

const followCase = (): Case => ({
  formatVersion: CASE_FORMAT_VERSION,
  id: 'follow-the-red-ball',
  name: 'Follow the Red Ball',
  brief: 'Keep the red ball in the middle of the wrist camera.',
  slot: { needs: ['arm'], minJoints: 2, binding: {} },
  world: {
    objects: [
      {
        id: 'ball',
        name: 'Red Ball',
        kind: 'sphere',
        position: BALL,
        rotation: [0, 0, 0],
        size: [BALL_MM * 2, BALL_MM * 2, BALL_MM * 2],
        color: '#e0201b',
        behavior: 'static',
      },
    ],
  },
  controls: [],
  reference: { timeline: [] },
  task: {
    seconds: 6,
    probes: [],
    contract: {
      version: 1,
      success: {
        eventually: { window: 'whole', state: { atom: { expr: { signal: 'elapsed' }, cmp: '>', value: 1, scale: 1 } } },
      },
      failures: [],
    },
  },
});

const FOLLOW = `<script>
const canvas = new OffscreenCanvas(160, 120);
const g = canvas.getContext('2d', { willReadFrequently: true });
const clamp = (x) => Math.max(-1, Math.min(1, x));
basecase.frames('wrist', { width: 160, fps: 15 }, (bitmap) => {
  g.drawImage(bitmap, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, bitmap.width, bitmap.height);
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 150 || data[i + 1] > 80 || data[i + 2] > 80) continue;
    sx += (i / 4) % width;
    sy += Math.floor(i / 4 / width);
    n++;
  }
  if (!n) return basecase.drive({ v: [0, 0, 0] });
  const ex = sx / n - width / 2;
  const ey = sy / n - height / 2;
  basecase.event('off', Math.hypot(ex, ey));
  basecase.event('size', width * 1000 + height);
  basecase.drive({ v: [0, clamp(-ex / 30), 0], aux: [clamp(-ey / 30), 0] });
});
</script>`;

interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function wristView(run: LiveRun, { width, height }: CodeFrameRequest): Pixels {
  const hand = run.engine.stats().effector ?? [0, 0, 0];
  const ball = run.objectAt('ball');
  const depth = ball[2] - hand[2];
  const focal = width / 2 / Math.tan(FOV / 2);
  const u = width / 2 - (focal * (ball[0] - hand[0])) / depth;
  const v = height / 2 - (focal * (ball[1] - hand[1])) / depth;
  const r = (focal * BALL_MM) / depth;
  const data = new Uint8ClampedArray(width * height * 4).fill(90);

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;

      if (Math.hypot(x + 0.5 - u, y + 0.5 - v) <= r) data.set([224, 32, 27], at);
    }

  return { width, height, data };
}

class StandInCanvas {
  private shown: Pixels | null = null;

  getContext() {
    return {
      drawImage: (pixels: Pixels) => (this.shown = pixels),
      getImageData: () => this.shown,
    };
  }
}

function wristCamera() {
  const streams: Array<{ port: MessagePort; request: CodeFrameRequest; next: number }> = [];
  const open: OpenCodeFrames = (request) => {
    if (request.camera !== 'wrist') return `names ${request.camera}, which isn’t a camera here`;

    const channel = new MessageChannel();
    const stream = { port: channel.port1, request, next: 0 };

    streams.push(stream);

    return { port: channel.port2, close: () => streams.splice(streams.indexOf(stream), 1) && channel.port1.close() };
  };
  const film = (run: LiveRun, t: number) => {
    for (const s of streams.filter((x) => t + 1e-9 >= x.next)) {
      s.next += 1 / s.request.fps;
      s.port.postMessage({ bitmap: wristView(run, s.request), time: t });
    }
  };

  return { open, film };
}

describe('follow the red ball', { timeout: 60_000 }, () => {
  it('finds the ball in wrist-camera frames and steers the arm until it’s centred within 20 px', async () => {
    const camera = wristCamera();
    const { run } = await liveCodeTry({
      mj: await loadMujoco(),
      kase: followCase(),
      robot: fixtureRobots().find((r) => r.id === 'arm-6dof')!,
      source: FOLLOW,
      frames: () => camera.open,
      globals: { OffscreenCanvas: StandInCanvas },
      player: (r, t) => camera.film(r, t + STEP_S),
    });
    const off = run.frame.log.events.flatMap(([name, value]) => (name === 'off' ? [value as number] : []));
    const sizes = new Set(run.frame.log.events.flatMap(([name, value]) => (name === 'size' ? [value] : [])));

    expect(run.frame.bridge.report().refused).toEqual([]);
    expect(sizes).toEqual(new Set([160_120]));
    expect(off.length).toBeGreaterThan(60);
    expect(off[0]).toBeGreaterThan(40);
    expect(Math.max(...off.slice(-15))).toBeLessThan(20);
    run.engine.dispose();
  });
});
