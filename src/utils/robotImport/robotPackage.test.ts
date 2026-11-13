import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { importRobot } from '../robotImport';
import { RobotChoiceError } from './entry';
import { parseJointMap } from './robotPackage';
import {
  DESK_ARM,
  deskArmJointMap,
  deskArmPackageFiles,
  deskArmPackageZip,
  deskArmUrdf,
  localFile,
  SHOULDER_CALIBRATION,
  TinyDomParser,
  zipOf,
} from './robotImport.fixtures';

const meshesUnder = (dir: string) =>
  Object.fromEntries(
    Object.entries(deskArmPackageFiles())
      .filter(([path]) => path.endsWith('.stl'))
      .map(([path, bytes]) => [`${dir}/${path.split('/').pop()}`, bytes]),
  );

const deg = (rad: number) => Math.round(((rad * 180) / Math.PI) * 100) / 100;

beforeEach(() => {
  vi.stubGlobal('DOMParser', TinyDomParser);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Robot Package import', () => {
  it('reads an exported package back with its joints, limits, masses, servos and calibration', async () => {
    const robot = await importRobot({ kind: 'files', files: [localFile('desk_arm.zip', deskArmPackageZip())] });
    const partOf = (link: string) => robot.parts.find((p) => p.robotLink?.link === link)!;

    expect(robot.name).toBe(DESK_ARM.name);
    expect(robot.notes).toEqual([]);
    expect(robot.joints.map((j) => [j.id, j.name, j.type, j.range])).toEqual(
      DESK_ARM.joints.map((j) => [j.id, j.name, 'revolute', [deg(j.limits[0]), deg(j.limits[1])]]),
    );
    expect(robot.joints[1].parentJoint).toBe('shoulder');

    for (const p of DESK_ARM.parts) expect(partOf(p.link).massG, p.link).toBe(p.massKg * 1000);

    for (const j of DESK_ARM.joints) {
      const servo = partOf(j.servoLink);

      expect(robot.joints.find((k) => k.id === j.id)!.actuators).toEqual([servo.id]);
      expect(servo).toMatchObject({ componentId: 'feetech-sts3215', componentVariant: 'c001' });
    }

    expect(robot.servoCalibrations).toEqual({ shoulder: { versions: [SHOULDER_CALIBRATION], active: 3 } });
  });

  it('opens the same package as a dropped folder', async () => {
    const files = Object.entries(deskArmPackageFiles()).map(([path, bytes]) => localFile(path, bytes));
    const robot = await importRobot({ kind: 'files', files });

    expect(robot.joints.map((j) => j.id)).toEqual(['shoulder', 'elbow']);
    expect(robot.servoCalibrations?.shoulder.active).toBe(3);
  });

  it('ignores a joint map that isn’t a Basecase package and picks the description itself', async () => {
    const zip = zipOf({
      ...meshesUnder('arm/meshes'),
      'arm/joint_map.json': strToU8('{"joints": "nope"}'),
      'arm/urdf/arm.urdf': strToU8(deskArmUrdf()),
    });
    const robot = await importRobot({ kind: 'files', files: [localFile('arm.zip', zip)] });

    expect(robot.name).toBe('Desk arm');
    expect(robot.servoCalibrations).toBeUndefined();
  });

  it('drops calibrations whose numbers aren’t numbers', () => {
    const map = deskArmJointMap();
    const bad = { ...SHOULDER_CALIBRATION, fit: { ...SHOULDER_CALIBRATION.fit, kt: '1e999' } };
    const parsed = parseJointMap(JSON.stringify({ ...map, joints: [{ ...map.joints[0], calibration: bad }] }));

    expect(parsed?.joints[0].calibration).toBeNull();
    expect(parsed?.joints[0].servo?.link).toBe('servo_1');
  });
});

describe('GitHub repository links', () => {
  const raw = 'https://raw.githubusercontent.com/me/arm/HEAD/';
  const meshes = meshesUnder('arm_description/meshes');
  const tree = ['README.md', 'arm_description/package.xml', 'arm_description/urdf/arm.urdf', ...Object.keys(meshes)];
  const served = new Map<string, string | Uint8Array<ArrayBuffer>>([
    ['https://api.github.com/repos/me/arm/git/trees/HEAD?recursive=1', JSON.stringify({ tree: listing(tree) })],
    [`${raw}arm_description/urdf/arm.urdf`, deskArmUrdf()],
    ...Object.entries(meshes).map(([path, bytes]) => [raw + path, bytes as Uint8Array<ArrayBuffer>] as const),
  ]);
  const fetched: string[] = [];

  function listing(paths: string[]) {
    return paths.map((path) => ({ path, type: 'blob' }));
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);

      const body = served.get(url);

      return body === undefined ? new Response('', { status: 404 }) : new Response(body);
    });
  });

  it('finds the description in a repo and records the file it came from', async () => {
    const robot = await importRobot({ kind: 'url', url: 'https://github.com/me/arm' });

    expect(robot.joints.map((j) => j.name)).toEqual(['Shoulder', 'Elbow']);
    expect(robot.notes).toEqual([]);
    expect(robot.parts[0].robotLink?.url).toBe(`${raw}arm_description/urdf/arm.urdf`);
    expect(fetched.every((url) => url.startsWith('https://'))).toBe(true);
    expect(fetched.filter((url) => !served.has(url))).toEqual([]);
  });

  it('asks which robot when a repo holds several', async () => {
    served.set(
      'https://api.github.com/repos/me/arms/git/trees/main?recursive=1',
      JSON.stringify({ tree: listing(['a/urdf/a.urdf', 'b/urdf/b.urdf']) }),
    );

    const pending = importRobot({ kind: 'url', url: 'https://github.com/me/arms/tree/main' });

    await expect(pending).rejects.toBeInstanceOf(RobotChoiceError);
    await expect(pending).rejects.toMatchObject({ choices: ['a/urdf/a.urdf', 'b/urdf/b.urdf'] });
  });
});
