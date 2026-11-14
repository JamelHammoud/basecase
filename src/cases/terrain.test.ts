import * as THREE from 'three';
import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it } from 'vitest';
import { fixtureTriangles } from '../sim/fixtures/parts';
import { fixtureRobots } from '../sim/fixtures/robots';
import { buildRig } from '../utils/kinematics';
import { buildCase, builderRobot, goalsFor, type CaseSpec } from './caseBuilder';
import { worldRandom } from './caseRandom';
import { groundOf } from './caseGoals';
import { runCase as runOn } from './runCase';
import type { V3 } from '../utils/kinematics';
import type { Case, WorldObject } from './schema';
import { reseededGround, TILE_PREFIX } from './terrain';
import { caseRobot, runCase } from './testing';

const fixture = (id: string) => fixtureRobots().find((r) => r.id === id)!;

const robotOf = (id: string) => {
  const r = fixture(id);

  return builderRobot(buildRig(r.joints, r.parts), r.parts);
};

function built(id: string, spec: CaseSpec): Case {
  const result = buildCase(spec, robotOf(id));

  if (!result.ok) throw new Error(result.problem);

  return result.kase;
}

const TERRAIN = ['rough', 'steps', 'slope'] as const;

const tiles = (kase: Case) => kase.world.objects.filter((o) => o.id.startsWith(TILE_PREFIX));

function surfaceAt(objects: WorldObject[], x: number, z: number): number {
  const down = new THREE.Ray(new THREE.Vector3(x, 1e4, z), new THREE.Vector3(0, -1, 0));

  return objects.reduce((top, o) => {
    const turn = new THREE.Euler(...(o.rotation.map((r) => THREE.MathUtils.degToRad(r)) as V3), 'XYZ');
    const frame = new THREE.Matrix4().compose(
      new THREE.Vector3(...o.position),
      new THREE.Quaternion().setFromEuler(turn),
      new THREE.Vector3(1, 1, 1),
    );
    const half = new THREE.Vector3(...o.size).multiplyScalar(0.5);
    const hit = down
      .clone()
      .applyMatrix4(frame.clone().invert())
      .intersectBox(new THREE.Box3(half.clone().negate(), half), new THREE.Vector3());

    return hit ? Math.max(top, hit.applyMatrix4(frame).y) : top;
  }, 0);
}

function surface(kase: Case): number[] {
  const statics = kase.world.objects.filter((o) => o.behavior === 'static');
  const points: number[] = [];

  for (let x = -400; x <= 400; x += 47) for (let z = -100; z <= 2000; z += 31) points.push(surfaceAt(statics, x, z));

  return points;
}

const WHOLE = { friction: [1, 1], mass: [1, 1], latencyMs: [0, 0] } as const;

const strength = (share: number) => ({ ...WHOLE, strength: [share, share] }) as never;

function geared(nm: number) {
  const r = fixture('rover-four');
  const robot = { ...r, joints: r.joints.map((j) => ({ ...j, effortNm: nm })) };
  const boxes = fixtureTriangles(robot.parts);
  const disc = new THREE.CylinderGeometry(35, 35, 20, 32).rotateZ(Math.PI / 2).toNonIndexed();
  const round = new Float32Array(disc.getAttribute('position').array);

  return {
    robot,
    run: { ...caseRobot(robot), partTriangles: (id: string) => (id.endsWith('_wheel_disc') ? round : boxes(id)) },
  };
}

describe('terrain worlds', () => {
  it('build for every ground goal on every fixture robot, and the route crosses them', () => {
    for (const r of fixtureRobots().filter((f) => groundOf(robotOf(f.id).facts)))
      for (const goal of goalsFor(robotOf(r.id)).filter((g) => g.kind !== 'touch' && g.kind !== 'pick'))
        for (const world of TERRAIN) {
          const kase = built(r.id, { goal: goal.kind, world });
          const ground = kase.world.objects.filter((o) => o.behavior === 'static');

          expect(ground.length, `${r.id} ${goal.kind} ${world}`).toBeGreaterThan(0);
          expect(
            kase.reference.timeline.every((c) => Math.abs((c.target?.[0] ?? 0) - robotOf(r.id).pivot[0]) < 400),
          ).toBe(true);
        }
  });

  it('take their number from the robot, and name the Case after the world', () => {
    expect(built('quad-servo', { goal: 'walk', world: 'rough' }).name).toBe('Walk Without Falling on Rough Ground');
    expect(
      Math.max(...tiles(built('quad-servo', { goal: 'walk', world: 'rough' })).map((t) => t.size[1])),
    ).toBeLessThanOrEqual(14);
    expect(built('quad-big', { goal: 'walk', world: 'steps' }).world.objects[0].size[1]).toBe(26);
    expect(
      built('rover-four', { goal: 'reach', world: 'steps' }).world.objects.find((o) => o.id === 'platform')?.size[1],
    ).toBe(18);
    expect(
      built('rover-four', { goal: 'reach', world: 'slope' }).world.objects.find((o) => o.id === 'ramp-up')?.rotation[0],
    ).toBeCloseTo(-12);
  });

  it('never get easier at a higher number, for the same robot and seed', () => {
    const pairs: Array<[string, CaseSpec, CaseSpec]> = [
      [
        'hexapod',
        { goal: 'walk', world: 'rough', values: { riseMm: 8 } },
        { goal: 'walk', world: 'rough', values: { riseMm: 20 } },
      ],
      [
        'quad-servo',
        { goal: 'walk', world: 'steps', values: { riseMm: 10 } },
        { goal: 'walk', world: 'steps', values: { riseMm: 30 } },
      ],
      [
        'rover-four',
        { goal: 'reach', world: 'slope', values: { inclineDeg: 8 } },
        { goal: 'reach', world: 'slope', values: { inclineDeg: 20 } },
      ],
    ];

    for (const [id, low, high] of pairs)
      for (const seed of [1, 2, 3]) {
        const easy = surface(reseededGround(built(id, low), worldRandom(seed)));
        const hard = surface(reseededGround(built(id, high), worldRandom(seed)));

        expect(
          hard.every((h, i) => h >= easy[i] - 1e-6),
          `${id} seed ${seed}`,
        ).toBe(true);
        expect(hard.some((h, i) => h > easy[i])).toBe(true);
      }
  });

  it('draw the same grid from the same seed, and a new one from another', async () => {
    const kase = built('quad-servo', { goal: 'walk', world: 'rough' });
    const heights = (k: Case) => tiles(k).map((t) => t.size[1]);
    const one = reseededGround(kase, worldRandom(1));

    expect(heights(built('quad-servo', { goal: 'walk', world: 'rough' }))).toEqual(heights(kase));
    expect(heights(reseededGround(kase, worldRandom(1)))).toEqual(heights(one));
    expect(heights(reseededGround(kase, worldRandom(2)))).not.toEqual(heights(one));
    expect([...heights(one)].sort()).toEqual([...heights(kase)].sort());
    expect(tiles(one).every((t) => t.position[1] === t.size[1] / 2)).toBe(true);

    const mj = await loadMujoco();
    const brief = built('quad-servo', { goal: 'walk', world: 'rough', values: { seconds: 2 } });
    const run = await runCase(mj, brief, fixture('quad-servo'), { controller: 'limp', seed: 1 });

    expect(heights(run.case)).toEqual(heights(one));
  });
});

describe('terrain worlds in MuJoCo', () => {
  it.each(['quad-servo', 'hexapod'])('%s walks across default Rough Ground, and misses it limp', async (id) => {
    const mj = await loadMujoco();
    const kase = built(id, { goal: 'walk', world: 'rough', values: { seconds: 12 } });

    expect((await runCase(mj, kase, fixture(id), { controller: 'reference' })).passed).toBe(true);
    expect((await runCase(mj, kase, fixture(id), { controller: 'limp' })).passed).toBe(false);
  });

  it('the weak quadruped misses Steps at the default riser', async () => {
    const mj = await loadMujoco();
    const id = 'must-fail-weak-quad';
    const result = await runCase(mj, built(id, { goal: 'walk', world: 'steps', values: { seconds: 4 } }), fixture(id), {
      controller: 'reference',
    });

    expect(result.passed).toBe(false);
  });

  it('the rover climbs the default Slope, and a rover with servos at 30% strength misses it', async () => {
    const mj = await loadMujoco();

    expect(
      (
        await runCase(mj, built('rover-four', { goal: 'reach', world: 'slope' }), fixture('rover-four'), {
          controller: 'reference',
        })
      ).passed,
    ).toBe(true);

    const { robot, run } = geared(0.06);
    const builder = builderRobot(buildRig(robot.joints, robot.parts), robot.parts);
    const caseIn = (world: 'slope' | 'floor') => {
      const result = buildCase({ goal: 'reach', world }, builder);

      if (!result.ok) throw new Error(result.problem);

      return result.kase;
    };
    const tryAt = (world: 'slope' | 'floor', share: number) =>
      runOn(mj, caseIn(world), run, { controller: 'reference', seed: 1, randomization: strength(share) });

    expect((await tryAt('slope', 1)).passed).toBe(true);
    expect((await tryAt('slope', 0.3)).passed).toBe(false);
    expect((await tryAt('floor', 0.3)).passed).toBe(true);
  });
});
