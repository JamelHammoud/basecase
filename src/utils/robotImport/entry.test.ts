import { describe, expect, it } from 'vitest';
import { chooseEntry, inScope } from './entry';
import { repoLink } from './github';

const mjcfIn = (robots: string[]) => async (path: string) => robots.includes(path);

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

  it('finds nothing in a folder without a description', async () => {
    expect(await chooseEntry(['notes/readme.md', 'pkg/package.xml'], mjcfIn([]))).toBeNull();
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

  it('leaves file links and other hosts to the file importer', () => {
    expect(repoLink('https://github.com/me/arm/blob/main/arm.urdf')).toBeNull();
    expect(repoLink('https://example.com/me/arm')).toBeNull();
    expect(repoLink('http://github.com/me/arm')).toBeNull();
  });
});
