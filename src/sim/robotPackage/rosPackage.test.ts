import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importRobot } from '../../utils/robotImport';
import { localFile, parseXml, TinyDomParser, zipOf } from '../../utils/robotImport/robotImport.fixtures';
import { parseUrdf } from '../../utils/robotImport/urdf';
import { packageFormat3Errors, packageXmlValues } from '../fixtures/packageFormat3';
import { fixturePackageJob } from '../fixtures/robotPackage';
import { fixtureRobots } from '../fixtures/robots';
import { buildRobotPackage, robotPackageFiles } from './buildRobotPackage';
import type { JointMap } from './jointMap';
import { ROS_EXEC_DEPENDS, ROS_LAUNCH, ROS_PACKAGE_NAME, ROS_RVIZ, ROS_URDF, rosPackageName } from './rosPackage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const robots = fixtureRobots().map((r) => [r.id, r] as const);

function unzipped(robot: (typeof robots)[number][1]) {
  const { job } = fixturePackageJob(robot);
  const zip = buildRobotPackage(job);
  const files = unzipSync(zip);
  const at = (path: string) => text(files[`${job.name}/${path}`]);

  return { job, zip, files, at, name: rosPackageName(job.robot) };
}

const controlJoints = (urdf: string) =>
  [...urdf.matchAll(/<ros2_control[\s\S]*?<\/ros2_control>/g)].flatMap((block) =>
    [...block[0].matchAll(/<joint name="([^"]+)">([\s\S]*?)<\/joint>/g)].map(([, name, body]) => ({
      name,
      min: Number(/<param name="min">([^<]+)</.exec(body)?.[1]),
      max: Number(/<param name="max">([^<]+)</.exec(body)?.[1]),
      position: body.includes('<command_interface name="position">'),
    })),
  );

describe('ROS package names', () => {
  it('follows ROS naming rules whatever the robot is called', () => {
    expect(rosPackageName('Arm 6-DOF')).toBe('arm_6_dof_description');
    expect(rosPackageName('6dof')).toBe('robot_6dof_description');
    expect(rosPackageName('__Quad__Servo__')).toBe('quad_servo_description');
    expect(rosPackageName('')).toBe('robot_description');
    expect(rosPackageName('desk_arm_description')).toBe('desk_arm_description');

    for (const name of ['Arm 6-DOF', '6dof', '__Quad__Servo__', '', 'Ünïcode bot!', '-']) {
      expect(rosPackageName(name), name).toMatch(ROS_PACKAGE_NAME);
    }
  });
});

describe('robot package as a ROS 2 description package', () => {
  it.each(robots)('%s is an ament package', (_id, robot) => {
    const { at, name } = unzipped(robot);
    const xml = at('package.xml');

    expect(name).toMatch(ROS_PACKAGE_NAME);
    expect(packageFormat3Errors(xml)).toEqual([]);
    expect(packageXmlValues(xml, 'name')).toEqual([name]);
    expect(packageXmlValues(xml, 'buildtool_depend')).toEqual(['ament_cmake']);
    expect(packageXmlValues(xml, 'exec_depend')).toEqual(expect.arrayContaining(ROS_EXEC_DEPENDS));
    expect(at('CMakeLists.txt')).toContain(`project(${name})`);
    expect(at('CMakeLists.txt')).toContain(
      'install(DIRECTORY urdf meshes launch rviz DESTINATION share/${PROJECT_NAME})',
    );
    expect(at(ROS_LAUNCH)).toContain(`get_package_share_directory("${name}")`);
  });

  it.each(robots)('%s points every package:// path at a file in the zip', (_id, robot) => {
    const { at, files, job, name } = unzipped(robot);
    const refs = [...at(ROS_URDF).matchAll(/filename="([^"]+)"/g)].map((m) => m[1]);

    expect(refs.length).toBeGreaterThan(0);

    for (const ref of refs) {
      expect(ref.startsWith(`package://${name}/`), ref).toBe(true);
      expect(files[ref.replace(`package://${name}/`, `${job.name}/`)], ref).toBeDefined();
    }
  });

  it.each(robots)('%s keeps its joints, with a ros2_control joint per movable one', (_id, robot) => {
    const { at, job } = unzipped(robot);
    const urdfText = at(ROS_URDF);
    const urdf = parseUrdf(parseXml(urdfText));
    const moving = urdf.joints.filter((j) => j.type !== 'fixed');
    const map = JSON.parse(at('joint_map.json')) as JointMap;
    const control = controlJoints(urdfText);

    expect(moving.map((j) => j.name)).toEqual(job.model.joints.map((j) => j.name));
    expect(control.map((j) => j.name)).toEqual(moving.map((j) => j.name));
    expect(control.every((j) => j.position)).toBe(true);

    for (const j of map.joints.filter((e) => e.min_rad !== undefined)) {
      const c = control.find((e) => e.name === j.name)!;

      expect([c.min, c.max]).toEqual([j.min_rad, j.max_rad]);
    }

    expect(urdf.links.has(/Fixed Frame: "([^"]+)"/.exec(at(ROS_RVIZ))![1])).toBe(true);
  });

  it('keeps MuJoCo, the joint map and policies at the root', () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
    const paths = Object.keys(robotPackageFiles(fixturePackageJob(arm).job)).filter((p) => !p.startsWith('meshes/'));

    expect(paths.sort()).toEqual([
      'CMakeLists.txt',
      'joint_map.json',
      ROS_LAUNCH,
      'package.xml',
      'robot.xml',
      ROS_RVIZ,
      ROS_URDF,
    ]);
  });

  it('still imports into Basecase, from the MJCF or from the URDF and its package:// meshes', async () => {
    vi.stubGlobal('DOMParser', TinyDomParser);

    const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
    const { zip, files, job } = unzipped(arm);
    const urdfOnly = zipOf(Object.fromEntries(Object.entries(files).filter(([p]) => !p.endsWith('/robot.xml'))));
    const fromMjcf = await importRobot({ kind: 'files', files: [localFile(`${job.name}.zip`, zip)] });
    const fromUrdf = await importRobot({ kind: 'files', files: [localFile(`${job.name}.zip`, urdfOnly)] });
    const names = job.model.joints.map((j) => j.name);

    expect(fromMjcf.joints.map((j) => j.id)).toEqual(names);
    expect(fromUrdf.notes).toEqual([]);
    expect(fromUrdf.joints.map((j) => j.id)).toEqual(names);
    expect(fromUrdf.parts.filter((p) => p.kind === 'mesh')).toHaveLength(arm.parts.length);
  });
});
