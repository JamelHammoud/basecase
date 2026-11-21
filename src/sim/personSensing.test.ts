import loadMujoco from '@mujoco/mujoco';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { beforeAll, expect, it } from 'vitest';
import { PERSON_ENCOUNTERS, personEncounterFixture } from '../cases/personEncounters.fixtures';
import { caseWorldItems } from '../cases/importedWorldItems';
import { caseRobot } from '../cases/testing';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { eyeCaster, type Eye } from './eyes';
import { SimEngine } from './engine';
import { buildMjcf } from './mjcf';
import { toMj, worldDelta } from './mjcfFrames';

let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

it.each(PERSON_ENCOUNTERS.map((name, index) => ({ name, index })))(
  '$name matches depth-eye and LiDAR returns with the visible head, torso, limbs and background',
  ({ index }) => {
    const fixture = personEncounterFixture(index);
    const robot = caseRobot(fixture.robot);
    const person = caseWorldItems(fixture.kase).find((item) => item.person)!;
    const background = {
      ...person,
      id: 'background',
      person: undefined,
      movable: false,
      kind: 'box' as const,
      mesh: undefined,
      position: [2500, 1200, person.position[2]] as [number, number, number],
      dimensions: { width: 20, height: 2400, depth: 2000 },
    };
    const world = [person, background];
    const model = buildMjcf({ ...robot, rig: buildRig(robot.joints, robot.parts), project: DEFAULT_PROJECT, world });
    const owner = model.bodies[0];
    const origins = [0.6, 0.92, 0.205, 1.1].map((height) => [
      -3000,
      person.dimensions.height * height,
      person.position[2],
    ]);
    const eyes: Eye[] = origins.map((origin, index) => ({
      part: `geometry-eye-${index}`,
      body: owner.name,
      pos: toMj(origin.map((n, i) => n - owner.origin[i]) as [number, number, number]),
      dirs: [1, 0, 0],
      cols: 1,
      rows: 1,
      rangeM: 6,
      scan: { rateHz: 50, fovDeg: 1 },
    }));

    model.scans = eyes;

    const engine = new SimEngine(mj, model);
    const caster = eyeCaster(mj, engine.model, engine.data, eyes);

    if (typeof caster === 'string') throw new Error(caster);

    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial();

    geometry.setAttribute('position', new Float32BufferAttribute(person.mesh!.positions, 3));
    geometry.setIndex(person.mesh!.indices);

    const mesh = new Mesh(geometry, material);
    const out = new Float32Array(4);

    try {
      for (const seconds of [0, 0.4, 0.6, 1]) {
        if (seconds) engine.step(seconds);

        const delta = worldDelta(model, engine.poses(), person.id)!;
        const at = new Vector3(...person.position).applyMatrix4(delta);

        mesh.position.copy(at);
        mesh.updateMatrixWorld(true);
        caster.cast(out, 0);
        engine.scanner!.tick();

        origins.forEach((origin, index) => {
          const fraction = [0.5, 0.18, 0.31, 0][index];
          const expected = index === 3 ? 5.49 : (at.x - person.dimensions.width * fraction - origin[0]) / 1000;
          const hits = new Raycaster(new Vector3(...origin), new Vector3(1, 0, 0)).intersectObject(mesh);

          if (index < 3) expect(hits[0].distance / 1000).toBeCloseTo(expected, 6);

          if (index === 3) expect(hits).toHaveLength(0);

          expect(out[index] * 6).toBeCloseTo(expected, 5);
          expect(engine.scanner!.values[index] * 6).toBeCloseTo(expected, 5);
        });
      }

      engine.world.reset();
      caster.cast(out, 0);
      expect(out[0] * 6).toBeCloseTo((person.position[0] - person.dimensions.width / 2 + 3000) / 1000, 5);
    } finally {
      geometry.dispose();
      material.dispose();
      caster.dispose();
      engine.dispose();
    }
  },
);
