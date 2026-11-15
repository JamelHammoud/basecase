import loadMujoco, { type MainModule, type MjData } from '@mujoco/mujoco';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { castEye, compactEye, eyeCaster, rayCast, type Eye, type WorldRays } from './eyes';
import { Scanner } from './scanner';

let mj: MainModule;

beforeAll(async () => {
  mj = await loadMujoco();
});

const XML = `<mujoco><worldbody>
  <body name="head" mocap="true"><geom type="sphere" size="0.01"/></body>
  <geom type="box" pos="2.1 0 0" size="0.1 3 3"/>
  <geom type="box" pos="-2.1 0 0" size="0.1 3 3"/>
  <geom type="box" pos="0 2.1 0" size="3 0.1 3"/>
  <geom type="box" pos="0 -2.1 0" size="3 0.1 3"/>
  <geom type="box" pos="0 0 2.1" size="3 3 0.1"/>
  <geom type="box" pos="0 0 -2.1" size="3 3 0.1"/>
</worldbody></mujoco>`;

const eye = (dirs: number[], extra: Partial<Eye> = {}): Eye => ({
  part: 'camera',
  body: 'head',
  pos: [0.04, -0.03, 0.02],
  dirs,
  cols: dirs.length / 3,
  rows: 1,
  rangeM: 4,
  ...extra,
});

function open() {
  const model = mj.MjModel.from_xml_string(XML);
  const data = new mj.MjData(model);
  const body = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, 'head');

  return { model, data, body };
}

function place(data: MjData, frame: number) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(frame * 0.13, frame * -0.07, frame * 0.11));

  data.mocap_pos.set([Math.sin(frame) * 0.2, Math.cos(frame) * 0.3, frame * 0.01]);
  data.mocap_quat.set([q.w, q.x, q.y, q.z]);
}

function expectedWorld(data: MjData, body: number, source: Eye): WorldRays {
  const rotation = new THREE.Matrix3().fromArray(data.xmat as Float64Array, body * 9).transpose();
  const position = new THREE.Vector3().fromArray(data.xpos, body * 3);
  const origin = new THREE.Vector3(...source.pos).applyMatrix3(rotation).add(position).toArray();
  const dirs: number[] = [];

  for (let i = 0; i < source.dirs.length; i += 3) {
    const direction = new THREE.Vector3().fromArray(source.dirs, i);

    if (direction.lengthSq()) dirs.push(...direction.applyMatrix3(rotation).toArray());
  }

  return { origin, dirs };
}

function distance(world: WorldRays, k: number): number {
  const origin = new THREE.Vector3(...world.origin);
  const direction = new THREE.Vector3().fromArray(world.dirs, k * 3);
  const wall = new THREE.Box3(new THREE.Vector3(-2, -2, -2), new THREE.Vector3(2, 2, 2));
  const point = new THREE.Ray(origin, direction).intersectBox(wall, new THREE.Vector3())!;

  return point.distanceTo(origin);
}

function appendPoints(points: number[], world: WorldRays) {
  for (let k = 0; k < world.dirs.length / 3; k++) {
    const d = distance(world, k);

    points.push(
      (world.origin[0] + world.dirs[k * 3] * d) * 1000,
      (world.origin[2] + world.dirs[k * 3 + 2] * d) * 1000,
      -(world.origin[1] + world.dirs[k * 3 + 1] * d) * 1000,
    );
  }
}

describe('shared sensor ray workspaces', () => {
  it('matches independent moving-body rays and wall returns without replacing buffers', () => {
    const { model, data, body } = open();
    const source = eye([0, 0, 0, 1, 0, 0, 0, -1, 0, 0, 0, 0, 0.6, 0, 0.8]);
    const original = structuredClone(source);
    const compact = compactEye(source, body);
    const workspace = compact.world;
    const origin = workspace.origin;
    const dirs = workspace.dirs;
    const run = rayCast(mj, model, data, compact.index.length);

    try {
      for (let frame = 0; frame < 30; frame++) {
        place(data, frame);
        mj.mj_kinematics(model, data);

        const expected = expectedWorld(data, body, source);
        const hits: number[] = [];
        const world = castEye(run, compact, (ray, d, k, current) => {
          expect(current).toBe(workspace);
          expect(ray).toBe([1, 2, 4][k]);
          expect(d).toBeCloseTo(distance(expected, k), 12);
          hits.push(ray);
        });

        expect(hits).toEqual([1, 2, 4]);
        expect(world).toBe(workspace);
        expect(world!.origin).toBe(origin);
        expect(world!.dirs).toBe(dirs);
        expect(world).toEqual(expected);
      }

      expect(source).toEqual(original);
    } finally {
      run.geomid.delete();
      run.dist.delete();
      data.delete();
      model.delete();
    }
  });

  it.each([300, 600])('reads nine rotation coefficients per cast for %i rays', (count) => {
    const compact = compactEye(eye(Array.from({ length: count }, () => [1, 0, 0]).flat()), 0);
    let reads = 0;
    const rotation = new Proxy([1, 0, 0, 0, 1, 0, 0, 0, 1], {
      get: (target, key, receiver) => {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    });
    const data = { xpos: [0, 0, 0], xmat: rotation } as unknown as MjData;
    const run = {
      mj: { mj_multiRay: () => {} } as unknown as MainModule,
      model: {} as ReturnType<typeof open>['model'],
      data,
      geomid: {} as ReturnType<typeof rayCast>['geomid'],
      dist: { GetView: () => new Float64Array(count).fill(-1) } as ReturnType<typeof rayCast>['dist'],
    };
    const world = compact.world;

    for (let frame = 0; frame < 20; frame++) {
      expect(castEye(run, compact, () => {})).toBe(world);
    }

    expect(reads).toBe(180);
    expect(world.dirs).toEqual(compact.dirs);
  });

  it('keeps empty sensors and separate eyes independent across changed poses and range misses', () => {
    const { model, data, body } = open();
    const empty = compactEye(eye([0, 0, 0]), body);
    const sensors = [eye([1, 0, 0]), eye([0, 1, 0], { rangeM: 0.5 }), eye([0, 0, 0])];
    const compacts = sensors.map((sensor) => compactEye(sensor, body));
    const caster = eyeCaster(mj, model, data, sensors);

    if (typeof caster === 'string') throw new Error(caster);

    const run = rayCast(mj, model, data, 1);
    const out = new Float32Array(5).fill(-7);

    try {
      expect(
        castEye(run, empty, () => {
          throw new Error('Empty sensor returned a hit');
        }),
      ).toBeNull();
      expect(compacts[0].world).not.toBe(compacts[1].world);
      expect(compacts[0].world.dirs).not.toBe(compacts[1].world.dirs);

      for (let frame = 0; frame < 10; frame++) {
        place(data, frame);
        caster.cast(out, 1);

        expect(out[1]).toBeCloseTo(distance(expectedWorld(data, body, sensors[0]), 0) / 4, 6);
        expect(Array.from(out.slice(2))).toEqual([1, 1, -7]);
        expect(out[0]).toBe(-7);
      }
    } finally {
      caster.dispose();
      run.geomid.delete();
      run.dist.delete();
      data.delete();
      model.delete();
    }
  });
});

describe('LiDAR hit buffers', () => {
  it('keeps scan order, per-sensor rates, reset behavior and independent published copies', () => {
    const { model, data, body } = open();
    const sensors = [
      eye([0, 0, 0, 1, 0, 0, 0, -1, 0], { scan: { rateHz: 10, fovDeg: 360 } }),
      eye([0, 0, 1, 0, 0, 0, 0, 1, 0], { scan: { rateHz: 5, fovDeg: 180 } }),
      eye([1, 0, 0, 0, 1, 0], { rangeM: 0.5 }),
      eye([0, 0, 0]),
    ];
    const scanner = Scanner.create(mj, model, data, sensors)!;

    try {
      for (const [time, frames] of [
        [0, [0, 0]],
        [0.1, [1, 0]],
        [0.2, [2, 2]],
        [0, [0, 0]],
      ] as const) {
        place(data, time * 10);
        data.time = time;

        const previous = scanner.latest();
        const saved = structuredClone(previous);

        expect(scanner.tick()).toBe(true);

        const scan = scanner.latest();
        const expectedPoints: number[] = [];

        for (let sensor = 0; sensor < 2; sensor++) {
          const source = sensors[sensor];

          place(data, frames[sensor]);
          mj.mj_kinematics(model, data);
          appendPoints(expectedPoints, expectedWorld(data, body, source));
        }

        expect(scan.counts).toEqual([2, 2, 0, 0]);
        expect(scan.points).toEqual(new Float32Array(expectedPoints));
        expect(scan.values[0]).toBe(1);
        expect(scan.values[4]).toBe(1);
        expect(Array.from(scan.values.slice(6))).toEqual([1, 1, 1]);
        expect(scanner.tick()).toBe(false);
        expect(previous).toEqual(saved);
      }

      expect(scanner.version).toBe(4);
    } finally {
      scanner.dispose();
      data.delete();
      model.delete();
    }
  });
});
