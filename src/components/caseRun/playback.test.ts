import { describe, expect, it } from 'vitest';
import { recordedBus } from '../../cases/console/recordedSignals';
import { context, draw, HZ, JOINTS, roverTrack, SECONDS } from './playbackFixture';

const playheadX = (html: string) => Number(/data-testid="trace-playhead" d="M([\d.]+) /.exec(html)?.[1]);

describe('panels over a played try', () => {
  it('plot the whole try with the playhead where it is, and draw the rover’s whole path on the map', () => {
    const bus = recordedBus(roverTrack());

    bus.seek(SECONDS * HZ * 0.25);

    const html = draw(context(bus, () => undefined));

    expect(html).toContain('data-playhead="30.00"');
    expect(playheadX(html)).toBeCloseTo(250, 0);
    expect(html.match(/data-testid="trace-joint\.\w+\.position"/g)).toHaveLength(JOINTS.length);
    expect(html).toContain(`data-lines="${JOINTS.length}"`);
    expect(Number(/data-path="(\d+)"/.exec(html)?.[1])).toBeGreaterThan(500);
    expect(html).toContain('data-testid="map-robot"');
    expect(html).toMatch(/data-signal="time">30.0 s</);
    expect(html).toMatch(/data-signal="robot.x">[^<]*0</);
  });
});
