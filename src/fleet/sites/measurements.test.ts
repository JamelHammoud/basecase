import { expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { prepareFacility } from './facility';
import { registerControls } from './registration.mjs';
import { siteControls } from './siteFixtures';
import { robotPosition } from '../browser/robotPosition';
import { arrangeMapLabels } from '../browser/mapLabels';
import type { RegistryItem } from '../browser/client';

it('measures a generated import and bounded pose projection without timing gates', async () => {
  const rows = Array.from({ length: 20000 }, (_, index) => `v ${index % 200} ${Math.floor(index / 200)} 12`);
  const faces = Array.from(
    { length: 19998 },
    (_, index) => `f ${(index % 19800) + 1} ${(index % 19800) + 2} ${(index % 19800) + 201}`,
  );
  const bytes = new TextEncoder().encode([...rows, ...faces].join('\n'));
  const started = performance.now();
  const imported = await prepareFacility([{ name: 'measured-facility.obj', bytes }], { units: 'm', up: 'Z' });
  const importMs = performance.now() - started;
  const registration = registerControls(siteControls);
  const robot: RegistryItem = {
    id: 'r',
    name: 'Rover',
    parent: 's',
    status: 'online',
    observedAt: null,
    stale: false,
    registration,
    pose: {
      frame: 'WGS84',
      datum: 'WGS84',
      vertical: { kind: 'ellipsoid' },
      latitude: 0,
      longitude: 0,
      altitudeM: 32,
      quality: 'reported',
      observedAt: new Date().toISOString(),
    },
  };
  const poseStarted = performance.now();
  const locations = Array.from({ length: 100 }, () => robotPosition(robot));
  const poseMs = performance.now() - poseStarted;
  const labelStarted = performance.now();
  const labels = arrangeMapLabels(
    Array.from({ length: 200 }, (_, index) => ({ id: String(index), name: 'Robot', x: 400, y: 200 })),
    900,
    420,
  );
  const labelMs = performance.now() - labelStarted;

  expect(imported.indices).toHaveLength(19998 * 3);
  expect(locations.every((location) => location?.altitudeM === 32)).toBe(true);
  expect(labels.length).toBeLessThanOrEqual(66);

  if (process.env.FLEET_FACILITY_MEASUREMENTS_FILE)
    await writeFile(
      process.env.FLEET_FACILITY_MEASUREMENTS_FILE,
      JSON.stringify(
        {
          sourceBytes: bytes.length,
          triangles: imported.indices.length / 3,
          importMs,
          poseBatch: 100,
          poseMs,
          labelBatch: 200,
          visibleLabels: labels.length,
          labelMs,
        },
        null,
        2,
      ),
    );
});
