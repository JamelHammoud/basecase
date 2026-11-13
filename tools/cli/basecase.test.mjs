import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loadMujoco from '@mujoco/mujoco';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builderRobot, buildCase } from '../../src/cases/caseBuilder';
import { checkCase, sceneCases, sceneRobot } from '../../src/cases/sceneCheck';
import { caseRobot } from '../../src/cases/testing';
import { fixtureRobots } from '../../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../../src/types/robotics';
import { buildRig } from '../../src/utils/kinematics';
import { decodeSceneFile, encodeSceneFile } from '../../src/utils/sceneFile';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'tools/cli/basecase.mjs');
const WHEEL_MOTOR_NM = 0.25;
const TIMEOUT_MS = 120_000;

let dir;

const rover = () => fixtureRobots().find((r) => r.id === 'rover-diff');

function reachASpot() {
  const robot = rover();
  const made = buildCase(
    { goal: 'reach', world: 'floor' },
    builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
  );

  if (!made.ok) throw new Error(made.problem);

  return made.kase;
}

function roverWith(strength) {
  const robot = rover();

  return { ...robot, joints: robot.joints.map((j) => ({ ...j, effortNm: WHEEL_MOTOR_NM * strength })) };
}

function roverScene({ strength = 1, cases = [reachASpot()] } = {}) {
  const robot = roverWith(strength);

  return {
    name: 'Rover',
    globalGoal: '',
    parts: robot.parts,
    annotations: [],
    project: { ...DEFAULT_PROJECT, joints: robot.joints, cases },
  };
}

async function sceneFile(name, scene) {
  const file = path.join(dir, `${name}.basecase`);

  fs.writeFileSync(file, await encodeSceneFile(scene));

  return file;
}

function basecase(...args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { cwd: ROOT, timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-cli-'));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('basecase check', () => {
  it(
    'exits 0 with each Case’s passes, margin and failure when the rover reaches its spot',
    async () => {
      const { code, stdout } = await basecase('check', await sceneFile('rover', roverScene()), '--json');
      const { cases } = JSON.parse(stdout);

      expect(code).toBe(0);
      expect(cases).toEqual([
        { id: 'reach-a-spot', name: 'Reach a Spot', runs: 1, passes: 1, margin: expect.any(Number), failed: null },
      ]);
      expect(cases[0].margin).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );

  it(
    'exits 1 and names the failure when the wheel servos are cut to 30% strength',
    async () => {
      const file = await sceneFile('weak', roverScene({ strength: 0.3 }));
      const json = await basecase('check', file, '--json');
      const table = await basecase('check', file);

      expect(json.code).toBe(1);
      expect(JSON.parse(json.stdout).cases[0]).toMatchObject({ passes: 0, failed: 'Missed' });
      expect(table.code).toBe(1);
      expect(table.stdout).toMatch(/^Reach a Spot {2}0 of 1 {2}.* {2}Missed\n$/);
    },
    TIMEOUT_MS,
  );

  it(
    'runs only the Case --case names',
    async () => {
      const spot = reachASpot();
      const file = await sceneFile('two', roverScene({ cases: [spot, { ...spot, id: 'again', name: 'Again' }] }));
      const { code, stdout } = await basecase('check', file, '--case', 'again', '--json');

      expect(code).toBe(0);
      expect(JSON.parse(stdout).cases.map((c) => c.id)).toEqual(['again']);
      expect((await basecase('check', file, '--case', 'nowhere')).code).toBe(2);
    },
    TIMEOUT_MS,
  );

  it(
    'exits 2 when the scene is missing, isn’t a scene, or the arguments are wrong',
    async () => {
      const notScene = path.join(dir, 'notes.basecase');

      fs.writeFileSync(notScene, 'hello');

      expect((await basecase('check', path.join(dir, 'missing.basecase'))).code).toBe(2);
      expect(await basecase('check', notScene)).toMatchObject({ code: 2, stderr: 'Not a Basecase scene.\n' });
      expect((await basecase('check')).code).toBe(2);
      expect((await basecase('run', notScene)).code).toBe(2);
    },
    TIMEOUT_MS,
  );

  it(
    'refuses a scene whose Case id climbs out of its folder',
    async () => {
      const file = await sceneFile('hostile', roverScene({ cases: [{ ...reachASpot(), id: '../../etc/passwd' }] }));
      const { code, stdout } = await basecase('check', file, '--json');

      expect(code).toBe(2);
      expect(stdout).toBe('');
    },
    TIMEOUT_MS,
  );
});

describe('one runner', () => {
  it(
    'gives the CLI’s verdict and margin to runCase on the same robot built from its fixture meshes',
    async () => {
      const mj = await loadMujoco();
      const kase = reachASpot();
      const { cases } = JSON.parse((await basecase('check', await sceneFile('parity', roverScene()), '--json')).stdout);
      const scene = await decodeSceneFile(await encodeSceneFile(roverScene()));
      const loaded = await checkCase(mj, sceneCases(scene)[0], await sceneRobot(scene, {}));
      const fixture = await checkCase(mj, kase, caseRobot(roverWith(1)));

      expect(cases[0]).toEqual(loaded);
      expect(loaded).toEqual(fixture);
    },
    TIMEOUT_MS,
  );
});

describe('basecase export', () => {
  it(
    'writes the Robot Package into the folder',
    async () => {
      const out = path.join(dir, 'package');
      const { code } = await basecase('export', await sceneFile('export', roverScene()), '--package', out);

      expect(code).toBe(0);
      expect(fs.readFileSync(path.join(out, 'robot.xml'), 'utf8')).toContain('<mujoco');
      expect(fs.readFileSync(path.join(out, 'urdf', 'robot.urdf'), 'utf8')).toContain('<robot');
      expect(JSON.parse(fs.readFileSync(path.join(out, 'joint_map.json'), 'utf8'))).toBeTruthy();
      expect(fs.readdirSync(path.join(out, 'meshes')).length).toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );
});
