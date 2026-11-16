import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { FleetIncidents } from '../../src/robot/fleetIncidents';
import { sessionSink, TryStore } from '../library/tryStore.mjs';
import { fleetWithFake } from './robotLinkFake.mjs';

it('binds a fleet fault and a lost quadruped to their own sessions while another arm accepts commands', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-incidents-'));
  const store = new TryStore({ triesDir: path.join(root, 'tries'), cacheFile: path.join(root, 'cache.json') });
  const incidents = new FleetIncidents();
  let now = 1000;
  const { fleet, events, spawned } = fleetWithFake({ tries: sessionSink(store), clock: () => now });
  const emit = fleet.emit;

  fleet.emit = (event) => {
    emit(event);
    incidents.event(event, now);
  };

  try {
    for (const unit of ['arm', 'other-arm', 'quadruped']) {
      fleet.connect(
        { family: 'feetech', ids: [1, 2], class: unit === 'quadruped' ? 'legged' : 'arm', emulated: true },
        unit,
      );
      fleet.record(
        { scene: { sceneId: 'scene-one', robot: unit, modelHash: 'a'.repeat(64), joints: ['shoulder', 'elbow'] } },
        unit,
      );

      const link = fleet.entryOf(unit).link;

      link.onLine(link.session, JSON.stringify({ event: 'hello', name: unit, emulated: true }));
      link.onLine(
        link.session,
        JSON.stringify({
          event: 'status',
          at_us: 0,
          mode: 'look',
          run: 'idle',
          fault_latched: false,
          joints: [
            { id: 1, position: 2048 },
            { id: 2, position: 2048 },
          ],
        }),
      );
    }

    now = 4000;

    const arm = fleet.entryOf('arm').link;

    arm.onLine(
      arm.session,
      JSON.stringify({
        event: 'status',
        at_us: 3e6,
        mode: 'test',
        run: 'running',
        fault_latched: false,
        joints: [
          { id: 1, position: 2200 },
          { id: 2, position: 2100 },
        ],
      }),
    );
    arm.onLine(
      arm.session,
      JSON.stringify({ event: 'fault', at_us: 3e6, code: 'stall', id: 2, message: 'Shoulder stalled' }),
    );

    const fault = incidents.items[0];
    const manifest = events.find((event) => event.event === 'recorded' && event.unit === 'arm').manifest;

    expect(fault).toMatchObject({
      unit: 'arm',
      session: manifest.id,
      recording: manifest.id,
      modelHash: manifest.robot.modelHash,
    });
    expect(store.manifests([fault.recording])).toHaveLength(1);

    const before = spawned[0].child.sent.length;

    incidents.acknowledge(fault.id, now);
    expect(spawned[0].child.sent).toHaveLength(before);
    expect(incidents.items[0].active).toBe(true);
    expect(fleet.command({ cmd: 'enter', mode: 'set_up' }, 'other-arm')).toEqual({ ok: true });
    expect(spawned[1].child.sent.at(-1)).toEqual({ cmd: 'enter', mode: 'set_up' });
    spawned[2].child.emit('exit');
    expect(incidents.items[0]).toMatchObject({ unit: 'quadruped', key: 'connection', active: true });
    expect(incidents.items[0].session).not.toBe(fault.session);
  } finally {
    fleet.dispose();

    for (const { child } of spawned) child.emit('exit');

    fs.rmSync(root, { recursive: true, force: true });
  }
});
