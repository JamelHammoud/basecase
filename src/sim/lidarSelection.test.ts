import { describe, expect, it, vi } from 'vitest';
import { COMPONENTS, type ComponentInfo } from '../data/components';
import { box } from './fixtures/parts';
import { buildScan, lidarSpec, MAX_SCANS, robotScans } from './lidar';
import type { SimBody } from './mjcfTypes';

const part = (id: string, componentId?: string) => ({
  ...box(id, [12, 34, 56], [10, 10, 10], 20),
  ...(componentId ? { kind: 'component' as const, componentId } : {}),
});

function countedBody(ids: string[]) {
  const read = vi.fn(() => ids);
  const body: SimBody = {
    name: 'sensor-body',
    origin: [10, 20, 30],
    get parts() {
      return read();
    },
  };

  return { body, read };
}

describe('LiDAR selection before preparation', () => {
  it('rejects other catalog groups without reading their specification rows', () => {
    const specs = vi.fn((): ComponentInfo['specs'] => []);

    for (const info of COMPONENTS.filter((entry) => entry.group !== 'LiDAR')) {
      expect(
        lidarSpec({
          ...info,
          get specs() {
            return specs();
          },
        }),
      ).toBeNull();
    }

    expect(specs).not.toHaveBeenCalled();
  });

  it.each([300, 600])('avoids body membership reads for %i unrelated parts', (count) => {
    const camera = COMPONENTS.find((entry) => entry.group === 'Cameras')!;
    const parts = Array.from({ length: count }, (_, i) => part(`other-${i}`, i % 2 ? camera.id : undefined));
    const bodies = Array.from({ length: 16 }, () => countedBody([]));

    expect(
      robotScans(
        bodies.map((entry) => entry.body),
        parts,
      ),
    ).toEqual([]);

    for (const entry of bodies) expect(entry.read).not.toHaveBeenCalled();
  });

  it('retains first-body ownership, scan order, missing-body rejection and the scan limit', () => {
    const lidars = COMPONENTS.filter((info) => info.group === 'LiDAR');
    const sensors = Array.from({ length: MAX_SCANS + 2 }, (_, i) => part(`lidar-${i}`, lidars[i % lidars.length].id));
    const first = countedBody(sensors.slice(1).map((sensor) => sensor.id));
    const duplicate: SimBody = { ...first.body, name: 'duplicate', origin: [90, 80, 70] };
    const unrelated = part('structure');
    const expected = sensors.slice(1, MAX_SCANS + 1).map((sensor) => buildScan([first.body], sensor));

    first.read.mockClear();

    const scans = robotScans([first.body, duplicate], [unrelated, ...sensors, unrelated]);

    expect(scans).toEqual(expected);
    expect(scans.map((scan) => scan.part)).toEqual(sensors.slice(1, MAX_SCANS + 1).map((sensor) => sensor.id));
    expect(scans.every((scan) => scan.body === first.body.name)).toBe(true);
    expect(first.read).toHaveBeenCalledTimes(sensors.length);
    expect(buildScan([first.body], part('unknown', 'missing-component'))).toBeNull();
    expect(first.read).toHaveBeenCalledTimes(sensors.length);
  });
});
