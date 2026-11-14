import { afterEach, describe, expect, it, vi } from 'vitest';
import { worldRefusal, type MovableObject, type WorldChange } from '../worldSet';
import type { FrameSize, FrameSource } from './codeStreams';
import { fakeClock, openTestFrame, type FrameOptions, type TestFrame } from './fixtures/codeFrames';
import { createSignalBus } from './signalBus';

type FakeBitmap = { width: number; height: number; closed: boolean; close: () => void };

const opened: TestFrame[] = [];

function open(html: string, o: Partial<FrameOptions> = {}) {
  const frame = openTestFrame(html, {
    bus: createSignalBus(),
    scope: { declared: new Set(), probes: new Set(), inputs: new Set(['code']) },
    ...o,
  });

  opened.push(frame);

  return frame;
}

afterEach(() => {
  opened.splice(0).forEach((f) => f.close());
});

const settle = () => new Promise((done) => setTimeout(done, 5));

const OBJECTS: MovableObject[] = [{ id: 'ball', movable: true }, { id: 'table' }];

function movableWorld() {
  const applied: WorldChange[] = [];
  const world = (change: WorldChange) => {
    const refusal = worldRefusal(OBJECTS, change.id);

    if (!refusal) applied.push(change);

    return refusal;
  };

  return { applied, world };
}

function camera(clock: ReturnType<typeof fakeClock>, fps = 60) {
  const pushed: FakeBitmap[] = [];
  const sizes: FrameSize[] = [];
  let stops = 0;

  const source: FrameSource = (name, size, onFrame) => {
    if (name !== 'wrist') return `${name} isn’t a camera here`;

    sizes.push(size);
    clock.every(1000 / fps, () => {
      const bitmap: FakeBitmap = { width: size.width, height: size.height, closed: false, close: () => undefined };

      bitmap.close = () => {
        bitmap.closed = true;
      };
      pushed.push(bitmap);
      onFrame(bitmap as unknown as ImageBitmap);
    });

    return () => {
      stops++;
    };
  };

  return { source, pushed, sizes, stops: () => stops };
}

const WRIST = (width: number, fps: number) => `<script>
window.stopWrist = basecase.frames('wrist', { width: ${width}, fps: ${fps} }, (bitmap) => seen.push(bitmap));
</script>`;

describe('world.set from a code panel', () => {
  it('moves a movable object and refuses a fixed one or a robot part before the studio sees it', async () => {
    const { applied, world } = movableWorld();
    const panel = open(
      `<script>
        basecase.world.set('table', { pose: { position: [0, 0, 10] } });
        basecase.world.set('link-2', { pose: { rotation: [0, 90, 0] } });
        basecase.world.set('ball', { pose: { position: [100, 0, 20] }, color: '#FF0000' });
      </script>`,
      { world },
    );

    await vi.waitFor(() =>
      expect(applied).toEqual([{ id: 'ball', pose: { position: [100, 0, 20] }, color: '#ff0000' }]),
    );
    expect(panel.bridge.report().refused).toEqual([
      'world refused: table isn’t movable',
      'world refused: link-2 isn’t in the Case’s world',
    ]);
  });

  it('refuses NaN and Infinity poses as malformed', async () => {
    const { applied, world } = movableWorld();
    const panel = open(
      `<script>
        basecase.world.set('ball', { pose: { position: [NaN, 0, 0] } });
        basecase.world.set('ball', { pose: { rotation: [0, Infinity, 0] } });
        basecase.world.set('ball', { pose: { position: [0, -Infinity, 0] }, visible: true });
      </script>`,
      { world },
    );

    await vi.waitFor(() => expect(panel.bridge.report().refused).toHaveLength(3));
    expect(new Set(panel.bridge.report().refused)).toEqual(new Set(['sent a malformed world message']));
    expect(applied).toEqual([]);
  });

  it('lets 60 of 10,000 calls in one second through, and notes it once', async () => {
    const clock = fakeClock();
    const panel = open(
      `<script>for (let i = 0; i < 10000; i++) basecase.world.set('ball', { pose: { position: [i, 0, 0] } });</script>`,
      { clock },
    );

    await vi.waitFor(() =>
      expect(panel.bridge.report().refused).toContain('world refused: more than 60 calls a second'),
    );
    await settle();
    expect(panel.log.world).toHaveLength(60);
    expect(panel.bridge.report().refused.filter((e) => e.startsWith('world refused'))).toHaveLength(1);
  });
});

describe('frames from a code panel', () => {
  it('sends frames at the clamped size and no faster than asked, transferring each bitmap', async () => {
    const clock = fakeClock();
    const wrist = camera(clock);
    const seen: FakeBitmap[] = [];
    const panel = open(WRIST(2000, 15), { clock, frames: wrist.source, globals: { seen } });

    await vi.waitFor(() => expect(wrist.sizes).toEqual([{ width: 640, height: 480, fps: 15 }]));

    for (const second of [1, 2]) {
      const before = seen.length;

      clock.tick(1000);
      await settle();
      expect(seen.length - before, `second ${second}`).toBeLessThanOrEqual(15);
      expect(seen.length - before, `second ${second}`).toBeGreaterThanOrEqual(12);
    }

    expect(seen.every((b) => b.width === 640 && b.height === 480 && !b.closed)).toBe(true);
    expect(wrist.pushed.filter((b) => !seen.includes(b)).every((b) => b.closed)).toBe(true);
    expect(panel.bridge.report()).toMatchObject({ errors: [], refused: [] });
  });

  it('asks for 320 × 240 at 10 fps by default, and refuses a missing camera and a fifth stream', async () => {
    const clock = fakeClock();
    const wrist = camera(clock);
    const panel = open(
      `<script>
        basecase.frames('front', {}, () => {});
        for (let i = 0; i < 5; i++) basecase.frames('wrist', {}, () => {});
      </script>`,
      { clock, frames: wrist.source },
    );

    await vi.waitFor(() => expect(panel.bridge.report().refused).toHaveLength(2));
    expect(panel.bridge.report().refused).toEqual([
      'frames refused: front isn’t a camera here',
      'frames refused: holds 4 streams already',
    ]);
    expect(wrist.sizes).toEqual(Array(4).fill({ width: 320, height: 240, fps: 10 }));
  });

  it('posts nothing after the panel stops a stream, even from a source that keeps sending', async () => {
    const clock = fakeClock();
    const wrist = camera(clock);
    const seen: FakeBitmap[] = [];
    const panel = open(WRIST(320, 15), { clock, frames: wrist.source, globals: { seen } });

    await vi.waitFor(() => expect(wrist.sizes).toHaveLength(1));
    clock.tick(500);
    await settle();
    expect(seen.length).toBeGreaterThan(0);
    panel.run('stopWrist()');
    await vi.waitFor(() => expect(wrist.stops()).toBe(1));

    const kept = seen.length;
    const pushed = wrist.pushed.length;

    clock.tick(1000);
    await settle();
    expect(seen).toHaveLength(kept);
    expect(wrist.pushed.length).toBeGreaterThan(pushed);
    expect(wrist.pushed.slice(pushed).every((b) => b.closed)).toBe(true);
  });

  it('posts nothing after the bridge closes', async () => {
    const clock = fakeClock();
    const wrist = camera(clock);
    const seen: FakeBitmap[] = [];
    const panel = open(WRIST(320, 15), { clock, frames: wrist.source, globals: { seen } });

    await vi.waitFor(() => expect(wrist.sizes).toHaveLength(1));
    panel.bridge.close();
    expect(wrist.stops()).toBe(1);

    const pushed = wrist.pushed.length;

    clock.tick(1000);
    await settle();
    expect(seen).toEqual([]);
    expect(wrist.pushed.length).toBeGreaterThan(pushed);
    expect(wrist.pushed.every((b) => b.closed)).toBe(true);
  });
});
