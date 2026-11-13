import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { importRobot } from '../robotImport';
import { safeEntryPath, unzipEntries } from './archive';
import { localFile, TinyDomParser, zipOf } from './robotImport.fixtures';
import { localTree, treeResolver } from './tree';

const URDF = (mesh: string) => `<robot name="sneaky">
  <link name="base"><visual><geometry><box size="0.1 0.1 0.1"/></geometry></visual></link>
  <link name="arm"><visual><geometry><mesh filename="${mesh}"/></geometry></visual></link>
  <joint name="hinge" type="revolute"><parent link="base"/><child link="arm"/><axis xyz="0 0 1"/>
    <limit lower="-1" upper="1"/></joint>
</robot>`;

beforeEach(() => {
  vi.stubGlobal('DOMParser', TinyDomParser);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('zip entry paths', () => {
  it('refuses names that climb out, start at a root or a drive, or are macOS metadata', () => {
    for (const name of [
      '../evil.urdf',
      'a/../../evil.urdf',
      '..',
      '/etc/passwd',
      'C:\\robot.urdf',
      '__MACOSX/a.urdf',
    ]) {
      expect(safeEntryPath(name), name).toBeNull();
    }

    expect(safeEntryPath('arm\\urdf\\.\\arm.urdf')).toBe('arm/urdf/arm.urdf');
  });

  it('drops escaping entries when unzipping', () => {
    const zip = zipOf({
      '../../escape.urdf': strToU8('<robot/>'),
      '/abs/robot.urdf': strToU8('<robot/>'),
      'arm/../../up.stl': strToU8('solid'),
      'arm/robot.urdf': strToU8('<robot/>'),
    });

    expect(unzipEntries(zip).map((e) => e.path)).toEqual(['arm/robot.urdf']);
  });

  it('keeps a dropped zip’s files inside it, whatever its description asks for', async () => {
    const zip = zipOf({
      'arm/robot.urdf': strToU8(URDF('../../../../secret.stl')),
      '../secret.stl': strToU8('solid secret'),
    });
    const tree = await localTree([localFile('arm.zip', zip), localFile('../outside.urdf', '<robot/>')]);
    const resolver = await treeResolver(tree, 'arm/arm/robot.urdf');

    expect(tree.paths).toEqual(['arm/arm/robot.urdf']);
    expect(await resolver.read('../../../../secret.stl')).toBeNull();
    expect(await resolver.read('package://arm/../../secret.stl')).toBeNull();

    const robot = await importRobot({ kind: 'files', files: [localFile('arm.zip', zip)] });

    expect(robot.notes).toEqual(["Couldn't read secret.stl"]);
    expect(robot.joints.map((j) => j.id)).toEqual(['hinge']);
  });
});
