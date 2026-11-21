import { afterEach, describe, expect, it, vi } from 'vitest';

const contents = new Map<string, string>();
const context = { session: 'operate-one', sceneId: 'scene-one', modelHash: 'a'.repeat(64), policyHash: null };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  contents.clear();
});

describe('retained fleet incident collection', () => {
  it('collects the unselected robot, acknowledges without changing its latch and survives restart', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => contents.get(key) ?? null,
      setItem: (key: string, value: string) => contents.set(key, value),
    });

    const store = await import('./robotStore');
    const incidents = await import('./fleetIncidentStore');

    store.receiveRobotEvent({ event: 'link', state: 'connected', unit: 'healthy' });
    store.receiveRobotEvent({ event: 'link', state: 'connected', unit: 'arm' });
    store.selectUnit('healthy');
    store.receiveRobotEvent({ event: 'fault', unit: 'arm', code: 'stall', message: 'Shoulder stalled', context });
    store.receiveRobotEvent({ event: 'status', unit: 'arm', at_us: 1, fault_latched: true });

    const incident = incidents.fleetIncidents.items[0];

    incidents.acknowledgeIncident(incident.id);
    expect(store.fleetSnapshot().selected).toBe('healthy');
    expect(store.robotSnapshot('arm').status?.fault_latched).toBe(true);
    expect(incidents.fleetIncidents.items[0]).toMatchObject({ active: true, session: 'operate-one' });
    expect(incidents.fleetIncidents.items[0].acknowledgedAt).not.toBeNull();
    vi.resetModules();

    const restarted = await import('./fleetIncidentStore');

    expect(restarted.fleetIncidents.items).toEqual(incidents.fleetIncidents.items);
  });
});
