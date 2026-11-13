import { describe, expect, it } from 'vitest';
import { chooseEntry, descriptionKind, inScope, type DescriptionKind } from './entry';
import { repoLink } from './github';

const kinds =
  (known: Record<string, DescriptionKind> = {}) =>
  async (path: string) =>
    known[path] ?? null;
const mjcfIn = (robots: string[]) => kinds(Object.fromEntries(robots.map((p) => [p, 'mjcf' as const])));

const GO2_REPO = [
  'README.md',
  'go2_description/package.xml',
  'go2_description/CMakeLists.txt',
  'go2_description/launch/display.launch.xml',
  'go2_description/config/controllers.xml',
  'go2_description/urdf/go2.urdf',
  'go2_description/meshes/base.dae',
  'go2_description/mjcf/go2.xml',
  'go2_description/mjcf/scene.xml',
  'go2_description/mjcf/assets.xml',
];

const UNITREE_ROS = [
  'robots/a1_description/package.xml',
  'robots/a1_description/urdf/a1.urdf',
  'robots/a1_description/meshes/trunk.dae',
  'robots/go1_description/package.xml',
  'robots/go1_description/urdf/go1.urdf',
  'robots/go1_description/meshes/trunk.dae',
  'robots/go1_description/urdf/old/go1_v0.urdf',
];

describe('chooseEntry', () => {
  it('prefers the robot MJCF over its scene, its URDF and ROS package files', async () => {
    const robots = ['go2_description/mjcf/go2.xml', 'go2_description/mjcf/scene.xml'];

    expect(await chooseEntry(GO2_REPO, mjcfIn(robots))).toEqual({ entry: 'go2_description/mjcf/go2.xml' });
  });

  it('takes the URDF when no MJCF describes a robot', async () => {
    expect(await chooseEntry(GO2_REPO, mjcfIn([]))).toEqual({ entry: 'go2_description/urdf/go2.urdf' });
  });

  it('asks only when several robots are equally likely', async () => {
    expect(await chooseEntry(UNITREE_ROS, mjcfIn([]))).toEqual({
      choices: ['robots/a1_description/urdf/a1.urdf', 'robots/go1_description/urdf/go1.urdf'],
    });
  });

  it('narrows to the linked folder', async () => {
    const scoped = inScope(UNITREE_ROS, 'robots/go1_description/');

    expect(await chooseEntry(scoped, mjcfIn([]))).toEqual({ entry: 'robots/go1_description/urdf/go1.urdf' });
  });

  it('takes a URDF saved as .xml', async () => {
    const paths = ['arm/arm.xml', 'arm/meshes/base.stl'];

    expect(await chooseEntry(paths, kinds({ 'arm/arm.xml': 'urdf' }))).toEqual({ entry: 'arm/arm.xml' });
  });

  it('falls back to an MJCF whose bodies sit in an included file', async () => {
    const paths = ['arm/arm.xml', 'arm/parts/body.xml'];

    expect(await chooseEntry(paths, kinds({ 'arm/arm.xml': 'mjcf-includes' }))).toEqual({ entry: 'arm/arm.xml' });
  });

  it('finds nothing in a folder without a description', async () => {
    expect(await chooseEntry(['notes/readme.md', 'pkg/package.xml'], mjcfIn([]))).toBeNull();
  });
});

describe('descriptionKind', () => {
  it('reads the root element', () => {
    expect(descriptionKind('<?xml version="1.0"?>\n<!-- arm -->\n<robot name="arm"><link name="base"/></robot>')).toBe(
      'urdf',
    );
    expect(descriptionKind('<mujoco model="go2"><worldbody/></mujoco>')).toBe('mjcf');
    expect(descriptionKind('<mujoco model="go2"><include file="body.xml"/></mujoco>')).toBe('mjcf-includes');
    expect(descriptionKind('<mujoco><default/></mujoco>')).toBeNull();
    expect(descriptionKind('<launch><node pkg="robot"/></launch>')).toBeNull();
  });
});

describe('repoLink', () => {
  it('reads repo, branch and folder links', () => {
    expect(repoLink('https://github.com/unitreerobotics/unitree_ros')).toEqual({
      owner: 'unitreerobotics',
      repo: 'unitree_ros',
      rest: [],
    });
    expect(repoLink('https://github.com/me/arm.git/')).toMatchObject({ repo: 'arm' });
    expect(repoLink('https://github.com/me/arm/tree/main/robots/go1_description')).toEqual({
      owner: 'me',
      repo: 'arm',
      rest: ['main', 'robots', 'go1_description'],
    });
  });

  it('reads a GitHub Download ZIP link as the repo at that ref', () => {
    expect(repoLink('https://github.com/me/arm/archive/refs/heads/main.zip')).toEqual({
      owner: 'me',
      repo: 'arm',
      rest: ['main'],
    });
    expect(repoLink('https://github.com/me/arm/archive/v1.2.zip')).toMatchObject({ rest: ['v1.2'] });
  });

  it('leaves file links and other hosts to the file importer', () => {
    expect(repoLink('https://github.com/me/arm/blob/main/arm.urdf')).toBeNull();
    expect(repoLink('https://example.com/me/arm')).toBeNull();
    expect(repoLink('http://github.com/me/arm')).toBeNull();
  });
});
