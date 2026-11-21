import { expect, it, vi } from 'vitest';
import { ELECTRICAL_PIN_MAPS } from './electricalPinMaps';
import { electricalClient } from './electricalClient';
import { replayFixture } from './powerReplay.fixtures';
import { retainPowerReplay, reopenPowerReplay } from './powerReplayRecord';
import { preparePowerReplay } from './powerReplayPreparation';
import { solvePowerReplay } from './powerReplaySolver';
import { POWER_REPLAY_LIMITS } from './powerReplayTypes';
import { encodeSceneFile, decodeSceneFile } from '../utils/sceneFile';
import { storedWalk } from '../workspace/storedWalk';

it('reopens actual scene bytes and invalidates electrical, model, route and trace edits while preserving evidence', async () => {
  const fixture = replayFixture(2);

  Object.assign(fixture.input.walk, storedWalk(fixture.input.walk, fixture.input.parts, fixture.input.project));

  const baseline = await retainPowerReplay(fixture);
  const before = structuredClone(fixture);
  const bytes = await encodeSceneFile({
    name: 'Replay arm',
    parts: fixture.input.parts,
    project: { ...fixture.input.project, powerReplay: { baseline } },
    globalGoal: '',
    annotations: [],
  });
  const reopened = await decodeSceneFile(bytes);
  const retained = reopened.project!.powerReplay!.baseline;

  expect((await reopenPowerReplay(retained, fixture.input)).applicable).toBe(true);
  expect(fixture).toEqual(before);

  const mutations = [
    (f: typeof fixture) => {
      f.input.project.tether!.volts = 7;
    },
    (f: typeof fixture) => {
      f.input.parts.find((part) => part.id === 'adapter0')!.position[0] += 1;
    },
    (f: typeof fixture) => {
      f.input.project.wiring = [
        {
          from: { partId: 'adapter0', port: 'bus-out' },
          to: { partId: 'motor1', port: 'bus-in' },
          supplyId: 'different-cable',
        },
      ];
    },
    (f: typeof fixture) => {
      f.input.walk.motorTrace.channels[0].model!.perNmA += 1;
    },
    (f: typeof fixture) => {
      f.input.walk.motorTrace.channels[0].amps[0] += 1;
    },
  ];

  for (const mutate of mutations) {
    const edited = structuredClone(fixture);

    mutate(edited);
    expect((await reopenPowerReplay(retained, edited.input)).applicable).toBe(false);
    expect(retained.result).toEqual(baseline.result);
  }

  const changedMaps = structuredClone(retained.input.pinMaps)!;

  changedMaps[0].ports[0].sourceLocator += ' changed evidence';
  expect((await reopenPowerReplay(retained, { ...fixture.input, pinMaps: changedMaps })).applicable).toBe(false);

  const corrupted = structuredClone(retained);

  corrupted.result.endpoints[0].volts[0] += 1;
  await expect(reopenPowerReplay(corrupted, fixture.input)).rejects.toThrow();
});

it('bounds retained evidence and refuses channel mismatch, stale trace bindings and missing conductor evidence', async () => {
  const fixture = replayFixture(2);
  const noModel = structuredClone(fixture);

  noModel.trace.channels[0].model = null;
  expect(() => preparePowerReplay(noModel)).toThrow();

  const mismatch = structuredClone(fixture);

  mismatch.trace.channels[0].actuators[0].variant = 'different';
  expect(() => preparePowerReplay(mismatch)).toThrow();

  const missingReturn = {
    ...fixture,
    input: {
      ...fixture.input,
      pinMaps: structuredClone(ELECTRICAL_PIN_MAPS).map((map) => ({
        ...map,
        ports: map.ports.map((port) => ({ ...port, pins: port.pins.filter((pin) => pin.function !== 'ground') })),
      })),
    },
  };

  expect(() => preparePowerReplay(missingReturn)).toThrow('Match every cable to supported power endpoints');

  const missing = structuredClone(fixture);

  missing.declarations.cables[0].evidence = '';
  expect(() => preparePowerReplay(missing)).toThrow();

  const oversized = structuredClone(fixture);

  oversized.trace.identity = 'x'.repeat(POWER_REPLAY_LIMITS.retainedBytes + 1);
  await expect(retainPowerReplay(oversized)).rejects.toThrow('4 MB');

  const network = preparePowerReplay(fixture);

  network.source.maximumA = 0.01;
  expect(solvePowerReplay(network)).toMatchObject({ status: 'limit', limit: { reason: 'current', sample: 0 } });
});

it.each(['ground', 'positive'] as const)('refuses an adapter without documented common %s continuity', (kind) => {
  const fixture = replayFixture(2);
  const pinMaps = structuredClone(ELECTRICAL_PIN_MAPS);
  const adapter = pinMaps.find((map) => map.componentId === 'waveshare-bus-servo-adapter-a')!;

  adapter.common = adapter.common.filter((functionName) => functionName !== kind);

  expect(() => preparePowerReplay({ ...fixture, input: { ...fixture.input, pinMaps } })).toThrow();
});

it('refuses independently valid comparison evidence from another frozen electrical input or trace', async () => {
  const fixture = replayFixture(2);
  const baseline = await retainPowerReplay(fixture);

  fixture.declarations.source.ohms *= 2;

  const comparison = await retainPowerReplay(fixture);

  expect((await reopenPowerReplay(comparison, fixture.input, baseline)).applicable).toBe(true);

  const other = structuredClone(fixture);

  other.trace.channels[0].amps[0] += 0.1;

  const unrelated = await retainPowerReplay(other);

  expect((await reopenPowerReplay(unrelated, other.input)).applicable).toBe(true);
  await expect(reopenPowerReplay(unrelated, other.input, baseline)).rejects.toThrow('frozen inputs');
});

it('terminates the owned worker on cancellation and refuses renderer fallback', async () => {
  const terminate = vi.fn();
  const postMessage = vi.fn();

  class PendingWorker {
    terminate = terminate;
    postMessage = postMessage;
  }

  vi.stubGlobal('Worker', PendingWorker);
  vi.stubGlobal('document', {});

  try {
    const client = electricalClient();
    const pending = client.call('replay', replayFixture());
    const refusal = expect(pending).rejects.toThrow('worker');

    client.dispose();
    await refusal;
    expect(terminate).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
