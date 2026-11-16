import { describe, expect, it } from 'vitest';
import { electricalProjection } from './electrical';
import { electricalRows } from './electricalChecks';
import { component, so101 } from './fixtures';
import { readinessOf } from '../readiness/readiness';
import { engineeringFindings } from '../readiness/findings';
import { runEngineering } from '../utils/engineering';
import { electricalScenes } from './electricalFixtures';

describe('electrical rail requirements', () => {
  it.each([
    { volts: 0, amps: 1 },
    { volts: 6, amps: Number.NaN },
  ])('keeps malformed supply declarations unresolved: %j', (tether) => {
    const scene = so101();

    scene.project.tether = tether;

    const projection = electricalProjection(scene);

    expect(projection.powerBudget).toBeNull();
    expect(projection.requirements.some((requirement) => requirement.code === 'missing-source')).toBe(true);
    expect(projection.nets.every((net) => net.nominalV === null)).toBe(true);
  });

  it('uses the existing fresh walking-current model while keeping unknown net loads unresolved', () => {
    const scene = so101();
    const walk = {
      policy: 'fixture',
      seconds: 14,
      fellAt: null,
      joints: {},
      power: { avgA: 3, peakA: 6, joints: { [scene.project.joints![0].id]: { avgA: 3, peakA: 6 } } },
    };
    const projection = electricalProjection({ ...scene, walk });

    expect(projection.powerBudget).toMatchObject({ estimateBasis: 'existing-walk-model', estimatedServoPeakA: 7.5 });
    expect(projection.nets.find((net) => net.function === 'positive' && net.bus === 0)).toMatchObject({
      currentModel: 'walk',
      modeledServoPeakA: 7.5,
    });
    expect(projection.requirements.some((requirement) => requirement.code === 'rail-overload')).toBe(true);
    expect(projection.nets.every((net) => net.loadA === null && net.transientA === null)).toBe(true);
  });

  it('preserves branch interface ratings without treating two parallel adapters as one six-amp trunk', () => {
    const scene = electricalScenes().find((entry) => entry.name === 'hexapod')!.scene;

    scene.project.tether = { volts: 6, amps: 30 };

    const projection = electricalProjection(scene);
    const shared = projection.nets.find((net) => net.function === 'positive' && net.buses.length === 2)!;

    expect(shared.interfaceLimitA).toBeNull();
    expect(shared.interfaceRatings.map((rating) => rating.maximumA)).toEqual([6, 6]);
    expect(projection.requirements.some((requirement) => requirement.code === 'rail-overload')).toBe(false);
  });

  it('keeps fuse and switch input and output nets distinct while propagating the proposed operating supply', () => {
    const scene = so101();

    scene.project.tether = { volts: 6, amps: 10 };

    const projected = electricalProjection(scene);
    const positive = projected.nets.filter((net) => net.function === 'positive');

    expect(positive).toHaveLength(3);
    expect(positive.every((net) => net.nominalV === 6 && net.maximumV === 6 && net.declaredA === 10)).toBe(true);
    expect(
      projected.requirements.filter((requirement) => requirement.code === 'unresolved-power-interface'),
    ).toHaveLength(3);
    expect(projected.requirements.some((requirement) => requirement.code === 'missing-ground')).toBe(false);
    expect(projected.nets.every((net) => net.loadA === null && net.transientA === null)).toBe(true);
  });

  it('preserves existing blockers and adds conflicting-rail and multiple-source findings through Checks', () => {
    const scene = so101();

    scene.project.tether = { volts: 24, amps: 0.5 };

    const projection = electricalProjection(scene);
    const engineering = runEngineering({ ...scene, measures: {}, servoOutputs: {} });
    const before = engineeringFindings(engineering);
    const rows = electricalRows(projection);
    const after = readinessOf([...before, ...engineeringFindings({ ...engineering, rows })], {
      parts: scene.parts,
      fingerprint: 'scene',
      rows,
    });

    expect(after.blockers.map((finding) => finding.key)).toEqual(
      expect.arrayContaining(before.filter((finding) => finding.level === 'blocker').map((finding) => finding.key)),
    );
    expect(projection.requirements.some((requirement) => requirement.code === 'conflicting-rail')).toBe(true);
    expect(after.checks.find((check) => check.name === 'Electrical connections')?.status).toBe('fail');

    scene.parts.push(component('a', 'ovonic-2s-2200-50c'), component('b', 'ovonic-3s-2200-50c'));
    expect(
      electricalProjection(scene).requirements.some((requirement) => requirement.code === 'conflicting-supplies'),
    ).toBe(true);
  });
});
