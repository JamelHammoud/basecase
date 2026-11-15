import { describe, expect, it, vi } from 'vitest';
import { G, cross, dot, norm, rotateAbout, sub, type V3 } from './engineeringMath';
import { HOLD_LIMIT, holdTorque, liftableKg } from './holdingTorque';
import { CLOSE_IN_SHARE, FULL_REACH_SHARE, payloadMap, poseArm, type ArmModel } from './payload';
import { seededRandom } from './seededRandom';

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function formerRotation(v: V3, axis: V3, degrees: number): V3 {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const perpendicular = cross(axis, v);
  const parallel = dot(axis, v) * (1 - cosine);

  return v.map((value, i) => value * cosine + perpendicular[i] * sine + axis[i] * parallel) as V3;
}

function formerPose(arm: ArmModel, values: number[]) {
  const joints = arm.links.map((link) => ({ anchor: link.anchor, axis: norm(link.axis), revolute: link.revolute }));
  const coms = arm.links.map((link) => link.com);
  let tip = arm.tip;

  joints.forEach((joint, i) => {
    const turn = (v: V3) => (joint.revolute ? formerRotation(v, joint.axis, values[i]) : v);
    const move = (p: V3) =>
      joint.revolute
        ? add(joint.anchor, formerRotation(sub(p, joint.anchor), joint.axis, values[i]))
        : add(p, joint.axis.map((value) => value * values[i]) as V3);

    for (let k = i + 1; k < joints.length; k++)
      joints[k] = { ...joints[k], anchor: move(joints[k].anchor), axis: turn(joints[k].axis) };

    for (let k = i; k < coms.length; k++) coms[k] = move(coms[k]);

    tip = move(tip);
  });

  return { joints, coms, tip };
}

function formerMap(arm: ArmModel, count: number) {
  const random = seededRandom('a11f7ed0a11f7ed0a11f7ed0a11f7ed0');
  const samples: Array<{ at: V3; kg: number; reach: number }> = [];

  for (let n = 0; n < count; n++) {
    const values = arm.links.map((link) => link.range[0] + (link.range[1] - link.range[0]) * random());
    const posed = formerPose(arm, values);

    if (posed.tip[1] < arm.floorY) continue;

    const kg = posed.joints.reduce((least, joint, i) => {
      const unit = joint.revolute ? 0.001 : 1;
      const own = posed.coms
        .slice(i)
        .reduce((sum, com, k) => sum + holdTorque(joint, com, [0, -arm.links[i + k].massKg * G, 0]), 0);
      const perKg = holdTorque(joint, posed.tip, [0, -G, 0]);

      return Math.min(least, liftableKg(own * unit, perKg * unit, HOLD_LIMIT * arm.links[i].stallNm));
    }, Infinity);
    const reach = Math.hypot(posed.tip[0] - arm.links[0].anchor[0], posed.tip[2] - arm.links[0].anchor[2]);

    samples.push({ at: posed.tip, kg, reach });
  }

  const reachMm = samples.reduce((best, sample) => Math.max(best, sample.reach), 0);

  if (!samples.length || reachMm <= 0) return null;

  return {
    samples: samples.map(({ at, kg }) => ({ at, kg })),
    reachMm,
    fullReachKg: Math.min(...samples.filter((sample) => sample.reach >= FULL_REACH_SHARE * reachMm).map((s) => s.kg)),
    closeInKg: Math.min(...samples.filter((sample) => sample.reach <= CLOSE_IN_SHARE * reachMm).map((s) => s.kg)),
  };
}

function armOf(count: number, seed = 1): ArmModel {
  const random = seededRandom(seed.toString(16).padStart(8, '0').repeat(4));
  const vector = (): V3 => [random() * 400 - 200, random() * 400 + 300, random() * 400 - 200];

  return {
    floorY: 0,
    tip: vector(),
    links: Array.from({ length: count }, (_, i) => ({
      anchor: vector(),
      axis: i % 4 === 0 ? [0, 0, 0] : vector(),
      revolute: i % 3 !== 1,
      range: [-180, 120],
      stallNm: random() * 8,
      massKg: random() * 0.5,
      com: vector(),
    })),
  };
}

describe('prepared payload rotations', () => {
  it('preserves complete mixed-joint poses across axes, angles and source edits', () => {
    for (let trial = 0; trial < 80; trial++) {
      const arm = armOf(1 + (trial % 8), trial + 1);
      const values = arm.links.map((_, i) => [0, -360, 90, 1e-9, 720, -57.2][(trial + i) % 6]);
      const before = structuredClone({ arm, values });
      const posed = poseArm(arm, values);
      const saved = structuredClone(posed);

      expect(posed).toEqual(formerPose(arm, values));
      arm.links.forEach((link, i) => {
        expect(rotateAbout(arm.tip, link.axis, values[i])).toEqual(formerRotation(arm.tip, link.axis, values[i]));
      });
      expect({ arm, values }).toEqual(before);
      arm.links[0].axis = [3, -7, 2];
      arm.links[0].anchor = [70, 20, -40];
      values[0] += 25;
      expect(poseArm(arm, values)).toEqual(formerPose(arm, values));
      expect(posed).toEqual(saved);
    }

    expect(poseArm({ links: [], tip: [1, 2, 3], floorY: 0 }, [])).toEqual({
      joints: [],
      coms: [],
      tip: [1, 2, 3],
    });
  });

  it('preserves every payload sample, reach limit and floor rejection', () => {
    for (let trial = 0; trial < 16; trial++) {
      const arm = armOf(1 + (trial % 6), trial + 100);
      const before = structuredClone(arm);

      expect(payloadMap(arm, 96)).toEqual(formerMap(arm, 96));
      arm.floorY = 450;
      expect(payloadMap(arm, 96)).toEqual(formerMap(arm, 96));
      arm.floorY = Infinity;
      expect(payloadMap(arm, 96)).toBeNull();
      arm.floorY = before.floorY;
      expect(arm).toEqual(before);
      expect(payloadMap(arm, 0)).toBeNull();
    }
  });

  it.each([
    [6, 300],
    [12, 600],
  ])('prepares each hinge once per sample for %i links and %i samples', (links, samples) => {
    const arm = armOf(links);

    arm.links.forEach((link) => {
      link.revolute = true;
    });

    const sine = vi.spyOn(Math, 'sin');
    const cosine = vi.spyOn(Math, 'cos');

    try {
      formerMap(arm, samples);
      expect(sine).toHaveBeenCalledTimes((samples * links * (3 * links + 1)) / 2);
      expect(cosine).toHaveBeenCalledTimes((samples * links * (3 * links + 1)) / 2);
      sine.mockClear();
      cosine.mockClear();
      payloadMap(arm, samples);
      expect(sine).toHaveBeenCalledTimes(samples * links);
      expect(cosine).toHaveBeenCalledTimes(samples * links);
    } finally {
      sine.mockRestore();
      cosine.mockRestore();
    }
  });

  it('does no trigonometry for prismatic chains', () => {
    const arm = armOf(5);

    arm.links.forEach((link) => {
      link.revolute = false;
    });

    const expected = formerMap(arm, 32);
    const sine = vi.spyOn(Math, 'sin');
    const cosine = vi.spyOn(Math, 'cos');

    try {
      expect(payloadMap(arm, 32)).toEqual(expected);
      expect(sine).not.toHaveBeenCalled();
      expect(cosine).not.toHaveBeenCalled();
    } finally {
      sine.mockRestore();
      cosine.mockRestore();
    }
  });
});

describe('prepared payload gravity loads', () => {
  it('preserves complete maps through mass, limit, geometry and floor edits', () => {
    for (let trial = 0; trial < 30; trial++) {
      const arm = armOf(1 + (trial % 8), trial + 200);
      const before = structuredClone(arm);
      const result = payloadMap(arm, 64);
      const saved = structuredClone(result);

      expect(result).toEqual(formerMap(arm, 64));
      expect(arm).toEqual(before);
      arm.links.forEach((link, i) => {
        link.massKg = [0, -0, 0.7, Infinity, NaN][(trial + i) % 5];
        link.stallNm = [0, -0, 2, Infinity, NaN][(trial + i * 2) % 5];
        link.com[0] += 50;
      });
      arm.floorY = 450;
      expect(payloadMap(arm, 64)).toEqual(formerMap(arm, 64));
      expect(result).toEqual(saved);
    }
  });

  it.each([
    [6, 300],
    [12, 600],
  ])('reads each mass and limit once for %i links and %i samples', (links, samples) => {
    const arm = armOf(links);
    let massReads = 0;
    let stallReads = 0;

    arm.floorY = -Infinity;
    arm.links.forEach((link) => {
      const { massKg, stallNm } = link;

      Object.defineProperties(link, {
        massKg: {
          get: () => {
            massReads++;

            return massKg;
          },
        },
        stallNm: {
          get: () => {
            stallReads++;

            return stallNm;
          },
        },
      });
    });

    const expected = formerMap(arm, samples);

    expect(massReads).toBe((samples * links * (links + 1)) / 2);
    expect(stallReads).toBe(samples * links);
    massReads = 0;
    stallReads = 0;
    expect(payloadMap(arm, samples)).toEqual(expected);
    expect(massReads).toBe(links);
    expect(stallReads).toBe(links);
    massReads = 0;
    stallReads = 0;
    arm.floorY = Infinity;
    expect(payloadMap(arm, samples)).toBeNull();
    expect(massReads).toBe(0);
    expect(stallReads).toBe(0);
    arm.floorY = -Infinity;
    expect(payloadMap(arm, 0)).toBeNull();
    expect(massReads).toBe(0);
    expect(stallReads).toBe(0);
  });
});
