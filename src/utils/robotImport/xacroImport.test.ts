import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenePart } from '../../types/robotics';
import { importRobot, type ImportedRobot } from './importRobot';
import { deskArmFiles, deskArmUrdf, localFile, TinyDomParser } from './robotImport.fixtures';
import { fusionArmFiles, urArmFiles } from './xacro.fixtures';

const filesOf = (files: Record<string, Uint8Array>) =>
  Object.entries(files).map(([path, bytes]) => localFile(path, bytes));

const jointsOf = (robot: ImportedRobot) =>
  robot.joints.map(({ id, type, origin, axis, range, effortNm, velocity, limb, parentJoint }) => ({
    id,
    type,
    origin,
    axis,
    range,
    effortNm,
    velocity,
    limb,
    parentJoint,
  }));

const partsOf = (robot: ImportedRobot) =>
  robot.parts.map((p: ScenePart) => ({ name: p.name, massG: p.massG, dimensions: p.dimensions }));

beforeEach(() => {
  vi.stubGlobal('DOMParser', TinyDomParser);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('importing xacro', () => {
  it('imports a fusion2urdf package with the same joints, limits and meshes as its URDF', async () => {
    const fromXacro = await importRobot({ kind: 'files', files: filesOf(fusionArmFiles()) });
    const fromUrdf = await importRobot({ kind: 'files', files: filesOf(deskArmFiles()) });

    expect(fromXacro.notes).toEqual([]);
    expect(fromXacro.name).toBe(fromUrdf.name);
    expect(jointsOf(fromXacro)).toEqual(jointsOf(fromUrdf));
    expect(partsOf(fromXacro)).toEqual(partsOf(fromUrdf));
    expect(fromXacro.triangles).toBe(fromUrdf.triangles);
  });

  it('imports a UR-style macro package', async () => {
    const robot = await importRobot({ kind: 'files', files: filesOf(urArmFiles()) });

    expect(robot.name).toBe('Ur5e');
    expect(robot.joints.map((j) => [j.id, j.range])).toEqual([
      ['left_shoulder_pan_joint', [-360, 360]],
      ['left_shoulder_lift_joint', [-180, 180]],
    ]);
    expect(robot.parts).toHaveLength(3);
  });

  it('imports the URDF when a repo has both', async () => {
    const plain = deskArmUrdf().replace('name="desk_arm"', 'name="plain_arm"');
    const files = [...filesOf(fusionArmFiles('arm')), localFile('arm/urdf/desk_arm.urdf', plain)];
    const robot = await importRobot({ kind: 'files', files });

    expect(robot.name).toBe('Plain arm');
  });

  it('fails naming the file when the xacro can’t be expanded', async () => {
    const files = [localFile('arm/urdf/arm.xacro', '<robot name="arm"><link name="${missing}"/></robot>')];

    await expect(importRobot({ kind: 'files', files })).rejects.toThrow('Couldn’t read arm/urdf/arm.xacro');
  });
});
