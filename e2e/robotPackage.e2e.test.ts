import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { openApp, partCount, type App } from './harness';

let app: App;

interface RobotPackage {
  files: Record<string, string>;
  simXml: string;
}

type Studio = { load: (r: unknown) => void; robotPackage: () => Promise<RobotPackage | null> };

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const exportButton = () => app.page.locator(visible('button'), { hasText: /^Export$/ }).first();

const robotPackageItem = () => app.page.locator(visible('[role=menuitem]'), { hasText: 'Robot Package' }).first();

const text = (b64: string) => Buffer.from(b64, 'base64').toString('utf8');

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('robot package export', () => {
  it('is off until the scene has a robot', async () => {
    await exportButton().click();
    await expect.poll(() => robotPackageItem().isDisabled()).toBe(true);
    await exportButton().click();
    await expect.poll(() => robotPackageItem().count()).toBe(0);
  });

  it('exports a preset arm from the Export menu as MJCF, a ROS 2 description package and a joint map', async () => {
    const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;

    await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
      name: 'arm',
      parts: arm.parts,
      project: { ...DEFAULT_PROJECT, joints: arm.joints },
    });
    await expect.poll(() => partCount(app.page)).toBe(arm.parts.length);

    await exportButton().click();
    await robotPackageItem().click();
    await expect.poll(() => app.page.getByText('Exported arm-robot').count(), { timeout: 30000 }).toBeGreaterThan(0);

    const made = (await app.page.evaluate(() =>
      (window as unknown as { __studio: Studio }).__studio.robotPackage(),
    )) as RobotPackage;
    const paths = Object.keys(made.files).sort();
    const at = (name: string) => made.files[`arm-robot/${name}`];
    const jointMap = JSON.parse(text(at('joint_map.json')));

    expect(paths.filter((p) => !p.includes('/meshes/'))).toEqual([
      'arm-robot/CMakeLists.txt',
      'arm-robot/joint_map.json',
      'arm-robot/launch/display.launch.py',
      'arm-robot/package.xml',
      'arm-robot/robot.xml',
      'arm-robot/rviz/display.rviz',
      'arm-robot/urdf/robot.urdf',
    ]);
    expect(paths.filter((p) => p.endsWith('.stl'))).toHaveLength(arm.parts.length);
    expect(text(at('robot.xml'))).toBe(made.simXml);
    expect(jointMap.joints).toHaveLength(6);
    expect(text(at('package.xml'))).toContain('<package format="3">');
    expect(text(at('launch/display.launch.py'))).toContain('robot_state_publisher');

    const urdf = text(at('urdf/robot.urdf'));
    const packageName = /<name>([^<]+)<\/name>/.exec(text(at('package.xml')))![1];

    expect(urdf.match(/<joint name="[^"]+" type="revolute">/g)).toHaveLength(6);
    expect(urdf.match(/<command_interface name="position">/g)).toHaveLength(6);

    for (const [, mesh] of urdf.matchAll(/filename="package:\/\/[^/]+\/([^"]+)"/g)) {
      expect(made.files[`arm-robot/${mesh}`], mesh).toBeDefined();
    }

    expect(urdf).toContain(`package://${packageName}/meshes/`);
    expect(app.errors).toEqual([]);
  });
});
