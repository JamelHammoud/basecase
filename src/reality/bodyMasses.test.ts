import { describe, expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import type { SimBody } from '../sim/mjcfTypes';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import type { PartMass } from '../utils/engineeringTypes';
import { bodyFitForCalibration, bodyPayloadPosition } from './bodyLayout';
import { bodyMassesForBodies, bodyMassProperties } from './bodyMasses';
import type { BodyFit, BodyHistory } from './bodyTypes';
import { activeBodyCalibration } from './history';

function history(robot: string, fit: BodyFit): BodyHistory {
  return {
    active: 1,
    versions: [
      {
        version: 1,
        verdict: 'measured',
        robot,
        fit,
        evidence: { presetErrorRad: 0.1, fittedErrorRad: 0.04, gain: 0.6 },
        modelFingerprint: 'fixture',
      },
    ],
  };
}

function fixture(count: number, robots = 3) {
  const parts = Array.from({ length: count }, (_, i) =>
    box(`p${i}`, [i * 7, i % 5, -i * 3], [10 + (i % 4), 20, 8], 50 + i),
  );
  const masses: PartMass[] = parts.map((part) => ({
    id: part.id,
    grams: part.massG!,
    centroid: [...part.position],
    source: 'printed',
  }));
  const bodies: SimBody[] = parts.map((part, i) => ({
    name: `b${i}`,
    robot: `r${i % robots}`,
    joint: `j${i}`,
    origin: [i * 2, 0, 0],
    parts: [part.id, 'missing'],
  }));
  const bodyCalibrations = Object.fromEntries(
    Array.from({ length: robots }, (_, r) => {
      const own = bodies.filter((body) => body.robot === `r${r}`);

      return [
        `r${r}`,
        history(`r${r}`, {
          massScales: Object.fromEntries(own.map((body, i) => [body.name, 0.5 + (i % 5) / 3])),
          payloadKg: Object.fromEntries(own.map((body, i) => [body.name, (i % 3) / 100])),
          floorFrictionScale: 0.8,
        }),
      ];
    }),
  );
  const project: ProjectSettings = { ...DEFAULT_PROJECT, bodyCalibrations };

  return { parts, masses, bodies, project };
}

function previousProperties(input: ReturnType<typeof fixture>) {
  const { masses, parts, project, bodies } = input;
  const parents = new Set(bodies.map((body) => body.parent));
  const adjusted = new Map(masses.map((mass) => [mass.id, mass]));
  const payloads: Record<string, { carrier: string; grams: number; centroid: PartMass['centroid'] }> = {};

  for (const body of bodies) {
    const calibration = activeBodyCalibration(project.bodyCalibrations?.[body.robot ?? '']);
    const fit = calibration ? bodyFitForCalibration(calibration, bodies, body.robot ?? '') : undefined;

    if (!fit) continue;

    const members = body.parts.filter((id) => adjusted.has(id));

    for (const id of members) {
      const mass = adjusted.get(id)!;

      adjusted.set(id, { ...mass, grams: mass.grams * (fit.massScales[body.name] ?? 1) });
    }

    const grams = parents.has(body.name) ? 0 : (fit.payloadKg[body.name] ?? 0) * 1000;

    if (members[0] && grams > 0)
      payloads[body.name] = { carrier: members[0], grams, centroid: bodyPayloadPosition(body, parts) };
  }

  return { scaled: [...adjusted.values()], payloads };
}

const properties = ({ masses, parts, project, bodies }: ReturnType<typeof fixture>) =>
  bodyMassProperties(masses, parts, project, bodies);

describe('body mass calibration preparation', () => {
  it('matches per-body resolution across mixed robots, missing masses, repeated carriers and reordered bodies', () => {
    for (let n = 3; n <= 90; n += 3) {
      const input = fixture(n);

      input.bodies[1].parts.push('p0');
      input.masses.splice(2, 1);
      input.bodies.reverse();
      delete input.project.bodyCalibrations!.r2;

      const before = structuredClone(input);

      expect(properties(input)).toEqual(previousProperties(input));
      expect(input).toEqual(before);
    }
  });

  it.each<BodyFit>([
    { massScales: { missing: 2 }, payloadKg: {}, floorFrictionScale: 1 },
    { massScales: { b0: 0 }, payloadKg: {}, floorFrictionScale: 1 },
    { massScales: {}, payloadKg: { b0: -0.1 }, floorFrictionScale: 1 },
    { massScales: {}, payloadKg: {}, floorFrictionScale: Number.NaN },
    { massScales: {}, payloadKg: { b0: 0.1 }, floorFrictionScale: 1 },
  ])('keeps invalid fits inactive across every body: %j', (fit) => {
    const input = fixture(12);

    input.bodies[3].parent = 'b0';
    input.project.bodyCalibrations!.r0 = history('r0', fit);
    input.project.bodyCalibrations!.r1.active = null;
    input.project.bodyCalibrations!.r2.versions[0].verdict = 'cant-tell';

    expect(properties(input)).toEqual({ scaled: input.masses, payloads: {} });
    expect(properties(input)).toEqual(previousProperties(input));
  });

  it('reads renamed links, changed fits, rollbacks and new topology afresh on later calls', () => {
    const input = fixture(9);
    const calibration = input.project.bodyCalibrations!.r0.versions[0];

    calibration.bodyKeys = Object.fromEntries(input.bodies.map((body) => [body.name, `joint:${body.joint}`]));

    for (const body of input.bodies) body.name = `renamed_${body.name}`;

    const initial = properties(input);

    expect(initial).toEqual(previousProperties(input));
    calibration.fit.massScales.b0 = 4;
    expect(properties(input)).toEqual(previousProperties(input));
    expect(properties(input)).not.toEqual(initial);
    input.project.bodyCalibrations!.r0.active = null;
    expect(properties(input)).toEqual(previousProperties(input));
    input.project.bodyCalibrations!.r0.active = 1;
    input.bodies[3].parent = 'renamed_b0';
    expect(properties(input)).toEqual(previousProperties(input));
    expect(initial.scaled[0].grams).toBe(input.masses[0].grams * 0.5);
  });

  it('keeps payload mass and centroid merging consistent with the separate export properties', () => {
    const input = fixture(6);
    const result = properties(input);
    const merged = bodyMassesForBodies(input.masses, input.parts, input.project, input.bodies);
    const expected = result.scaled.map((mass) => {
      const payload = Object.values(result.payloads).find((entry) => entry.carrier === mass.id);

      if (!payload) return mass;

      const grams = mass.grams + payload.grams;

      return {
        ...mass,
        grams,
        centroid: mass.centroid.map((v, axis) => (v * mass.grams + payload.centroid[axis] * payload.grams) / grams),
      };
    });

    expect(merged).toEqual(expected);
    expect(bodyMassProperties([], [], DEFAULT_PROJECT, [])).toEqual({ scaled: [], payloads: {} });
  });

  it.each<BodyHistory | undefined>([
    undefined,
    history('r0', { massScales: { missing: 2 }, payloadKg: {}, floorFrictionScale: 1 }),
    { ...history('r0', { massScales: {}, payloadKg: {}, floorFrictionScale: 1 }), active: null },
  ])('resolves absent, rejected and rolled-back histories once per robot: %j', (value) => {
    const input = fixture(12);
    let reads = 0;

    Object.defineProperty(input.project.bodyCalibrations!, 'r0', {
      get: () => {
        reads++;

        return value;
      },
    });

    const expected = previousProperties(input);

    reads = 0;

    expect(properties(input)).toEqual(expected);
    expect(reads).toBe(1);
  });

  it.each([300, 600])('bounds body membership reads for %i bodies across two measured robots', (count) => {
    const input = fixture(count, 2);
    let reads = 0;

    for (const body of input.bodies) {
      const robot = body.robot;

      Object.defineProperty(body, 'robot', {
        get: () => {
          reads++;

          return robot;
        },
      });
    }

    const expected = previousProperties(input);
    const previousReads = reads;

    reads = 0;

    expect(properties(input)).toEqual(expected);
    expect(reads).toBeLessThanOrEqual(6 * count);
    expect(previousReads).toBe(2 * count * count + 2 * count);
  });
});
