import { describe, expect, it } from 'vitest';
import { FleetIncidents, MAX_INCIDENTS, readIncidents } from './fleetIncidents';

const context = { session: 'operate-one', sceneId: 'scene-one', modelHash: 'a'.repeat(64), policyHash: 'b'.repeat(64) };
const fault = (unit = 'arm') => ({ event: 'fault', unit, code: 'stall', id: 2, message: 'Shoulder stalled', context });

describe('fleet incidents', () => {
  it('retains independent faults, disconnects and recording identity without sending commands', () => {
    const log = new FleetIncidents();

    log.event({ event: 'hello', unit: 'arm' }, 99);
    log.event(fault(), 100);
    expect(log.items[0].name).toBe('arm');
    log.event(fault('other-arm'), 101);
    log.event({ event: 'link', unit: 'quadruped', state: 'lost', message: 'Standing and holding', context }, 102);
    log.event({ event: 'recorded', unit: 'arm', id: context.session, manifest: { id: context.session } }, 103);
    expect(log.items).toHaveLength(3);
    expect(log.items.find((i) => i.unit === 'arm')).toMatchObject({
      ...context,
      recording: context.session,
      active: true,
    });
    log.acknowledge(log.items[0].id, 104);
    expect(log.items[0]).toMatchObject({ active: true, acknowledgedAt: 104 });
    expect(log.items.find((i) => i.unit === 'other-arm')?.acknowledgedAt).toBeNull();
  });

  it('coalesces duplicate faults, ignores reordered samples, and separates recovery from recurrence', () => {
    const log = new FleetIncidents();

    log.event(fault(), 100);
    log.event(fault(), 101);
    log.event({ event: 'status', unit: 'arm', at_us: 200, fault_latched: true }, 102);
    log.event({ event: 'status', unit: 'arm', at_us: 100, fault_latched: false }, 103);
    expect(log.items).toHaveLength(1);
    expect(log.items[0].active).toBe(true);
    log.event({ event: 'status', unit: 'arm', at_us: 300, fault_latched: false }, 104);
    expect(log.items[0]).toMatchObject({ active: false, recoveredAt: 104 });
    log.event(fault(), 105);
    expect(log.items).toHaveLength(2);
  });

  it('persists bounded history and keeps unknown telemetry from recovering a condition', () => {
    const log = new FleetIncidents();

    for (let at = 1; at <= MAX_INCIDENTS + 20; at++) {
      log.condition({ unit: 'arm', key: 'voltage', message: 'Supply low', context }, true, at * 2);
      log.condition({ unit: 'arm', key: 'voltage', message: 'Supply low', context }, false, at * 2 + 1);
    }

    log.condition({ unit: 'arm', key: 'voltage', message: 'Supply low', context }, true, 1000);
    log.condition({ unit: 'arm', key: 'voltage', message: 'Supply low', context }, null, 1001);

    const saved = JSON.stringify(log.items);
    const restored = new FleetIncidents(readIncidents(saved));

    expect(restored.items).toHaveLength(MAX_INCIDENTS);
    expect(restored.items[0].active).toBe(true);
    expect(readIncidents('broken')).toEqual([]);
    expect(readIncidents(JSON.stringify([{ unit: '../../bad' }]))).toEqual([]);
  });

  it('links closed tries by session rather than newest unit recording, including unavailable tries', () => {
    const log = new FleetIncidents();

    log.event(fault(), 100);
    log.event({ event: 'recorded', unit: 'arm', id: 'operate-other', manifest: { id: 'operate-other' } }, 101);
    expect(log.items[0].recording).toBeNull();
    log.event({ event: 'recorded', unit: 'arm', id: context.session, manifest: null }, 102);
    expect(log.items[0]).toMatchObject({ session: context.session, recording: null });
  });

  it('collects bounded event load without multiplying incidents', () => {
    const log = new FleetIncidents();

    for (let at = 1; at <= 10000; at++) log.event(fault(at % 2 ? 'arm' : 'other-arm'), at);

    expect(log.items).toHaveLength(2);
    expect(log.items.every((i) => i.lastAt >= 9999)).toBe(true);
  });
});

describe('fleet freshness and storage boundaries', () => {
  it('ignores stale healthy telemetry and old fault delivery after recovery', () => {
    const log = new FleetIncidents();

    log.event({ event: 'status', unit: 'arm', at_us: 0, fault_latched: false }, 1000);
    log.event({ ...fault(), at_us: 100000 }, 1100);
    log.event({ event: 'status', unit: 'arm', at_us: 200000, fault_latched: false }, 3000);
    expect(log.items[0].active).toBe(true);
    log.event({ event: 'status', unit: 'arm', at_us: 2100000, fault_latched: false }, 3100);
    expect(log.items[0].active).toBe(false);
    log.event({ ...fault(), at_us: 100000 }, 3200);
    expect(log.items).toHaveLength(1);
  });

  it('retains bounded UTF-8 history and binds a session first observed after a condition starts', () => {
    const log = new FleetIncidents();

    log.condition({ unit: 'arm', key: 'volts', message: 'Supply low' }, true, 1);
    log.condition({ unit: 'arm', key: 'volts', message: 'Supply low', context }, true, 2);
    expect(log.items[0].session).toBe(context.session);

    for (let at = 3; at < 300; at++)
      log.condition({ unit: 'arm', key: `${at}-${'🤖'.repeat(120)}`, message: '機'.repeat(512), context }, true, at);

    const bytes = new TextEncoder().encode(JSON.stringify(log.items)).byteLength;

    expect(bytes).toBeLessThanOrEqual(256 * 1024);
    expect(readIncidents(JSON.stringify(log.items))).toHaveLength(log.items.length);
  });
});

it('binds a recorded try even when a condition result arrives after the recording event', () => {
  const log = new FleetIncidents();

  log.event({ event: 'recorded', unit: 'arm', id: context.session, manifest: { id: context.session } }, 100);
  log.condition({ unit: 'arm', key: 'volts', message: 'Supply low', context }, true, 99);
  expect(log.items[0].recording).toBe(context.session);
});

it('rejects restored dates outside the display range and discards mismatched recording references', () => {
  const log = new FleetIncidents();

  log.event(fault(), 1000);

  const incident = log.items[0];

  for (const field of ['startedAt', 'lastAt', 'recoveredAt', 'acknowledgedAt'])
    expect(readIncidents(JSON.stringify([{ ...incident, [field]: 1e100 }]))).toEqual([]);

  expect(readIncidents(JSON.stringify([{ ...incident, recording: 'operate-other' }]))[0].recording).toBeNull();
});
