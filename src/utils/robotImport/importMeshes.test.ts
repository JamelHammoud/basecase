import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { importRobot } from './importRobot';
import { cubeStl, localFile, TinyDomParser } from './robotImport.fixtures';

beforeEach(() => vi.stubGlobal('DOMParser', TinyDomParser));
afterEach(() => vi.unstubAllGlobals());

it.each([1, 8])(
  'loads shared meshes once across %i links while retaining every visual and one missing-file note',
  async (count) => {
    const links = Array.from(
      { length: count },
      (_, i) => `<link name="link${i}">
    <visual><geometry><mesh filename="cube.stl"/></geometry></visual>
    <visual><origin xyz="0.2 0 0"/><geometry><mesh filename="cube.stl" scale="2 1 1"/></geometry></visual>
    <visual><geometry><box size="0.01 0.01 0.01"/></geometry></visual>
    <visual><geometry><mesh filename="missing.stl"/></geometry></visual>
    <visual><geometry><mesh filename="missing.stl"/></geometry></visual>
  </link>`,
    );
    const joints = Array.from(
      { length: count - 1 },
      (_, i) => `<joint name="fixed${i}" type="fixed">
    <parent link="link0"/><child link="link${i + 1}"/></joint>`,
    );
    const mesh = localFile('cube.stl', cubeStl(0.02));
    const reads = vi.spyOn(mesh.blob, 'arrayBuffer');
    const progress: string[] = [];
    const robot = await importRobot(
      {
        kind: 'files',
        files: [localFile('robot.urdf', `<robot name="shared">${links.join('')}${joints.join('')}</robot>`), mesh],
      },
      { onProgress: (message) => progress.push(message) },
    );

    expect(reads).toHaveBeenCalledTimes(1);
    expect(robot.notes).toEqual(['Couldn’t read missing.stl']);
    expect(robot.parts).toHaveLength(count);
    expect(robot.triangles).toBe(count * 36);
    expect(progress.filter((message) => message.startsWith('Loading meshes'))).toEqual([
      'Loading meshes 1/2…',
      'Loading meshes 2/2…',
    ]);
    expect(robot.joints).toEqual([]);
  },
);
