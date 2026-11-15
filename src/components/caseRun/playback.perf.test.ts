import { expect, it } from 'vitest';
import { recordedBus } from '../../cases/console/recordedSignals';
import { context, draw, HZ, roverTrack, SECONDS } from './playbackFixture';

it('repaints six panels on a two-minute try within a frame after a seek', () => {
  const bus = recordedBus(roverTrack());
  const ctx = context(bus, () => undefined);
  const times: number[] = [];

  for (let i = 0; i < 50; i++) {
    const started = performance.now();

    bus.seek(Math.round((((i * 37) % 50) / 50) * SECONDS * HZ));
    draw(ctx);
    times.push(performance.now() - started);
  }

  const settled = times.slice(10).sort((a, b) => a - b);

  expect(settled[Math.floor(settled.length / 2)]).toBeLessThan(16);
});
