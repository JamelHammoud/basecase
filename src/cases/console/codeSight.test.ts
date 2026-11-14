import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { V3 } from '../../utils/kinematics';
import { withCaseStore, type StoreValue } from '../caseStore';
import { readCases, type Case } from '../schema';
import { presetCase } from '../testing';
import { ballFrame, ballPixel, PixelCanvas } from './fixtures/ballCamera';
import { openTestFrame } from './fixtures/codeFrames';
import { openCodeRun } from './fixtures/codeRun';
import type { FrameSize, FrameSource } from './codeStreams';
import { createSignalBus } from './signalBus';

const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
const BALL: V3 = [90, 25, 330];

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
}, 60000);

function redBall(): Case {
  const kase = presetCase(arm, 'touch-the-dots');
  const ball = {
    id: 'ball',
    name: 'Red Ball',
    kind: 'sphere' as const,
    position: BALL,
    rotation: [0, 0, 0] as V3,
    size: [50, 50, 50] as V3,
    color: '#e62828',
    behavior: 'marker' as const,
  };
  const seen = { atom: { expr: { signal: 'ball' }, cmp: '<' as const, value: 400, scale: 400 } };

  return {
    ...kase,
    world: { objects: [ball] },
    reference: { timeline: [] },
    task: {
      seconds: 10,
      probes: [{ signal: 'ball', from: 'end-effector', to: { object: 'ball' } }],
      contract: { version: 1, success: { eventually: { window: 'whole', state: seen } }, failures: [] },
    },
  };
}

const FOLLOW = `<script>
const W = 320;
const H = 240;
const g = new OffscreenCanvas(W, H).getContext('2d');
const clamp = (x) => Math.max(-0.5, Math.min(0.5, x));
let frames = 0;
basecase.drive({ v: [0, 0, 0], target: [0, 250, 250] });
basecase.frames('wrist', { width: W, fps: 15 }, (bitmap) => {
  frames += 1;
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  if (frames < 20) return;
  const { data } = g.getImageData(0, 0, W, H);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 180 || data[i + 1] > 90) continue;
    sx += (i / 4) % W;
    sy += Math.floor(i / 4 / W);
    n += 1;
  }
  if (!n) return basecase.drive({ v: [0, 0, 0] });
  const ex = sx / n - W / 2;
  const ey = sy / n - H / 2;
  basecase.drive({ v: Math.hypot(ex, ey) < 4 ? [0, 0, 0] : [clamp(ey * 0.01), clamp(ex * 0.01), 0] });
});
</script>`;

describe('code that sees what the robot sees', () => {
  it('finds the red ball in wrist-camera frames and steers the arm until it’s centred within 20 px', async () => {
    let stream: { size: FrameSize; onFrame: (bitmap: ImageBitmap) => void; last: number } | null = null;
    const sizes: FrameSize[] = [];
    const frames: FrameSource = (camera, size, onFrame) => {
      if (camera !== 'wrist') return `${camera} isn’t a camera here. Cameras: wrist`;

      sizes.push(size);
      stream = { size, onFrame, last: -Infinity };

      return () => {
        stream = null;
      };
    };
    const run = await openCodeRun(mj, {
      robot: arm,
      kase: redBall(),
      html: FOLLOW,
      frames,
      globals: { OffscreenCanvas: PixelCanvas },
    });
    const offset = () => {
      const { x, y } = ballPixel(run.hand(), BALL, { width: 320, height: 240, fps: 15 });

      return Math.hypot(x - 160, y - 120);
    };

    let before = 0;

    await run.step(8, (t) => {
      if (Math.abs(t - 1.2) < 1e-6) before = offset();

      if (!stream || t - stream.last < 1 / stream.size.fps - 1e-9) return;

      stream.last = t;
      stream.onFrame(ballFrame(run.hand(), BALL, stream.size) as unknown as ImageBitmap);
    });

    expect(sizes).toEqual([{ width: 320, height: 240, fps: 15 }]);
    expect(run.frame.bridge.report()).toMatchObject({ errors: [], refused: [] });
    expect(before).toBeGreaterThan(80);
    expect(offset()).toBeLessThanOrEqual(20);
    await run.finish();
    expect(stream).toBeNull();
  }, 60000);
});

const HIGH_SCORE = (score: number) => `<script>
(async () => {
  const kept = (await basecase.store.get()) ?? { best: 0 };
  const best = Math.max(kept.best, ${score});
  if (best > kept.best) await basecase.store.set({ best });
  document.body.dataset.best = String(best);
})();
</script>`;

describe('state a Case’s code keeps', () => {
  it('keeps a high score through a scene reload', async () => {
    let cases: Case[] = [presetCase(arm, 'touch-the-dots')];
    const id = cases[0].id;
    const store = {
      get: () => cases[0].store ?? null,
      set: (value: StoreValue) => {
        cases = withCaseStore(cases, id, value);
      },
    };
    const panel = (score: number) =>
      openTestFrame(HIGH_SCORE(score), {
        bus: createSignalBus(),
        scope: { declared: new Set(), probes: new Set(), inputs: new Set() },
        store,
      });

    const first = panel(7);

    await vi.waitFor(() => expect(first.body.dataset.best).toBe('7'));
    first.close();

    const saved = JSON.parse(JSON.stringify({ project: { cases } }));

    cases = readCases(saved.project.cases);
    expect(cases[0].store).toEqual({ best: 7 });

    const second = panel(3);

    await vi.waitFor(() => expect(second.body.dataset.best).toBe('7'));
    second.close();
    expect(cases[0].store).toEqual({ best: 7 });
  });
});
