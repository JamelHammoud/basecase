import { expect, it } from 'vitest';
import { component } from './fixtures';
import { replayFixture } from './powerReplay.fixtures';
import { preparePowerReplay } from './powerReplayPreparation';
import { solvePowerReplay } from './powerReplaySolver';
import { retainPowerReplay, reopenPowerReplay } from './powerReplayRecord';
import { POWER_REPLAY_LIMITS } from './powerReplayTypes';

function prepared(count = 1, adapters = 1, name = 'pan-tilt') {
  const fixture = replayFixture(count, adapters, name);

  return { ...fixture, network: preparePowerReplay(fixture) };
}

it.each([
  ['single-servo arm', 1, 1],
  ['two-axis pan-tilt', 2, 1],
  ['parallel-jaw gripper', 1, 1],
  ['daisy-chained arm', 6, 1],
  ['star-wired quadruped', 12, 12],
  ['hexapod with shared trunk', 18, 2],
  ['rover with unequal branches', 4, 2],
  ['mixed-bus supported rail', 5, 2],
  ['repeated leg modules', 12, 4],
  ['asymmetric payload arm', 7, 2],
])(
  'conserves current and energy for %s through production trace and electrical derivation',
  (name, count, adapters) => {
    const { network, trace } = prepared(Number(count), Number(adapters), String(name));
    const result = solvePowerReplay(network);
    let sourceEnergyJ = 0;
    let deliveredEnergyJ = 0;
    let lossEnergyJ = 0;

    expect(result.status).toBe('complete');
    expect(result.windowS).toBeCloseTo(0.026, 12);
    expect(result.endpoints).toHaveLength(Number(count) + Number(adapters));
    expect(new Set(result.sourceA).size).toBeGreaterThan(1);

    for (let sample = 0; sample < trace.channels[0].amps.length; sample++) {
      const loadA = network.loads.reduce((sum, load) => sum + load.amps[sample], 0);
      const deliveredW = result.endpoints.reduce(
        (sum, endpoint, i) => sum + endpoint.volts[sample] * network.loads[i].amps[sample],
        0,
      );

      sourceEnergyJ += 6 * result.sourceA[sample] * trace.windowS;
      deliveredEnergyJ += deliveredW * trace.windowS;
      lossEnergyJ += result.lossW[sample] * trace.windowS;

      expect(result.sourceA[sample]).toBeCloseTo(loadA, 11);
      expect(6 * loadA).toBeCloseTo(deliveredW + result.lossW[sample], 10);

      for (const vertex of network.vertices.filter((id) => id !== network.sourceId)) {
        const incoming = result.segments.filter((s) => s.to === vertex).reduce((sum, s) => sum + s.amps[sample], 0);
        const outgoing = result.segments.filter((s) => s.from === vertex).reduce((sum, s) => sum + s.amps[sample], 0);
        const load = network.loads.filter((l) => l.node === vertex).reduce((sum, l) => sum + l.amps[sample], 0);

        expect(incoming - outgoing).toBeCloseTo(load, 11);
      }
    }

    expect(sourceEnergyJ).toBeCloseTo(deliveredEnergyJ + lossEnergyJ, 10);
  },
);

it('matches an independent series circuit including source and shared return resistance', () => {
  const { network } = prepared();
  const result = solvePowerReplay(network);
  const firstA = network.loads.reduce((sum, load) => sum + load.amps[0], 0);
  const motorA = network.loads.find((l) => l.partId === 'motor1')!.amps[0];
  const trunkR = network.segments.slice(0, 3).reduce((sum, s) => sum + s.outgoingOhms + s.returnOhms, 0);
  const branch = network.segments[3];
  const expected = 6 - firstA * (0.02 + trunkR) - motorA * (branch.outgoingOhms + branch.returnOhms);

  expect(result.endpoints.find((e) => e.partId === 'motor1')!.volts[0]).toBeCloseTo(expected, 12);
  expect(result.limiting.sample).toBe(0);
  expect(result.limiting.timeS).toBe(0);
});

it('preserves ideal-source controls and equivalent segment subdivision', () => {
  const { network } = prepared(2);
  const ideal = structuredClone(network);

  ideal.source.ohms = 0;
  ideal.segments.forEach((s) => {
    s.outgoingOhms = 0;
    s.returnOhms = 0;
  });
  expect(solvePowerReplay(ideal).endpoints.every((e) => e.volts.every((v) => v === 6))).toBe(true);

  const divided = structuredClone(network);
  const segment = divided.segments[0];
  const end = segment.to;

  segment.to = 'subdivision';
  segment.outgoingOhms /= 2;
  segment.returnOhms /= 2;
  divided.vertices.push('subdivision');
  divided.segments.splice(1, 0, { ...segment, id: 'subdivision', from: 'subdivision', to: end });

  const dividedResult = solvePowerReplay(divided);
  const original = solvePowerReplay(network);

  for (const [index, endpoint] of dividedResult.endpoints.entries()) {
    endpoint.volts.forEach((v, sample) => expect(v).toBeCloseTo(original.endpoints[index].volts[sample], 12));
  }
});

it('retains deterministic inputs, compares a frozen trace and invalidates changed wiring', async () => {
  const fixture = replayFixture(2);
  const record = await retainPowerReplay(fixture);
  const reopened = await reopenPowerReplay(JSON.parse(JSON.stringify(record)), fixture.input);

  expect(reopened.applicable).toBe(true);
  expect(reopened.result).toEqual(record.result);

  const edited = structuredClone(fixture);

  edited.declarations.cables[0].outgoingOhms *= 2;

  const comparison = await retainPowerReplay({ ...edited, trace: record.trace });

  expect(comparison.traceFingerprint).toBe(record.traceFingerprint);
  expect(comparison.result.limiting.volts).toBeLessThan(record.result.limiting.volts);
  expect(
    (
      await reopenPowerReplay(record, {
        ...fixture.input,
        project: {
          ...fixture.input.project,
          wiring: [
            { from: { partId: 'adapter0', port: 'bus-out' }, to: { partId: 'motor1', port: 'bus-in' }, anchors: [] },
          ],
        },
      })
    ).applicable,
  ).toBe(false);
  expect(record.result).toEqual(reopened.result);
});

it('refuses incomplete resistance, missing loads, allocation ambiguity, identities and malformed samples', () => {
  const fixture = replayFixture(2);
  const missingResistance = structuredClone(fixture);

  missingResistance.declarations.cables.pop();
  expect(() => preparePowerReplay(missingResistance)).toThrow();

  const missingLoad = structuredClone(fixture);

  missingLoad.declarations.fixedLoads = {};
  expect(() => preparePowerReplay(missingLoad)).toThrow();

  const missingMotor = structuredClone(fixture);

  missingMotor.trace.channels.pop();
  expect(() => preparePowerReplay(missingMotor)).toThrow('Capture current for every actuator');

  for (const amps of [[-1], [NaN], [Infinity], [], [1]]) {
    const malformed = structuredClone(fixture);

    malformed.trace.channels[0].amps = amps;
    expect(() => preparePowerReplay(malformed)).toThrow();
  }

  const mismatched = structuredClone(fixture);

  mismatched.trace.channels[0].actuatorIds = ['missing'];
  expect(() => preparePowerReplay(mismatched)).toThrow();
  mismatched.trace.channels[0].actuatorIds = ['motor1', 'motor2'];
  expect(() => preparePowerReplay(mismatched)).toThrow();
});

it('reports nonphysical results and declared limits without clamping', () => {
  const { network } = prepared();

  network.source.ohms = 100;

  const result = solvePowerReplay(network);

  expect(result.status).toBe('limit');
  expect(result.limiting.volts).toBeLessThan(0);
  expect(result.endpoints.some((e) => e.volts.some((v) => v < 0))).toBe(true);
});

it('refuses cycles, disconnected loads, multiple supplies, regulators and bounded storage overflow', async () => {
  const { network } = prepared();

  expect(() => solvePowerReplay({ ...network, segments: [...network.segments, network.segments[0]] })).toThrow();
  expect(() => solvePowerReplay({ ...network, vertices: [...network.vertices, 'isolated'] })).toThrow();

  const fixture = replayFixture();

  fixture.input.parts.push(component('buck', 'pololu-d36v50f6'));
  expect(() => preparePowerReplay(fixture)).toThrow();
  fixture.input.parts.pop();
  fixture.input.parts.push(component('battery', 'ovonic-3s-2200-50c'));
  expect(() => preparePowerReplay(fixture)).toThrow();
  fixture.input.parts.pop();
  fixture.trace.channels[0].amps = Array(POWER_REPLAY_LIMITS.samples + 1).fill(1);
  expect(() => preparePowerReplay(fixture)).toThrow();
});

it('matches independent branched-circuit voltage drops and separates shared return loss', () => {
  const { network } = prepared(2, 2);
  const result = solvePowerReplay(network);
  const currents = network.loads.filter((load) => load.jointId).map((load) => load.amps[0]);
  const total = currents[0] + currents[1] + 0.2;
  const resistance = network.segments.map((segment) => segment.outgoingOhms + segment.returnOhms);
  const trunkDrop = total * (network.source.ohms + resistance[0] + resistance[1]);
  const expected = currents.map(
    (amps, index) => 6 - trunkDrop - (amps + 0.1) * resistance[2 + index] - amps * resistance[4 + index],
  );
  const motors = result.endpoints.filter((endpoint) => endpoint.jointId);

  motors.forEach((endpoint, index) => expect(endpoint.volts[0]).toBeCloseTo(expected[index], 12));

  const idealReturn = structuredClone(network);

  idealReturn.segments.forEach((segment) => {
    segment.returnOhms = 0;
  });

  const withoutReturn = solvePowerReplay(idealReturn).endpoints.filter((endpoint) => endpoint.jointId);
  const expectedReturnDrop = total * 0.03 + (currents[0] + 0.1) * 0.015 + currents[0] * 0.015;

  expect(withoutReturn[0].volts[0] - motors[0].volts[0]).toBeCloseTo(expectedReturnDrop, 12);
});
