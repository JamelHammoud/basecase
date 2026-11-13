import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectSettings, ScenePart } from '../src/types/robotics';
import { DESK_ARM, deskArmPackageZip } from '../src/utils/robotImport/robotImport.fixtures';
import { openApp, type App } from './harness';

let app: App;

interface Scene {
  parts: ScenePart[];
  project: ProjectSettings;
}

const scene = () =>
  app.page.evaluate(() => (window as unknown as { __studio: { sceneRecord: () => Scene } }).__studio.sceneRecord());

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Robot Package import', () => {
  it('inserts the robot when its package zip is dropped on the canvas', async () => {
    const zip = Buffer.from(deskArmPackageZip()).toString('base64');

    await app.page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dataTransfer = new DataTransfer();
      const target = document.querySelector('main canvas') ?? document.querySelector('main')!;
      const box = target.getBoundingClientRect();
      const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };

      dataTransfer.items.add(new File([bytes], 'desk_arm.zip', { type: 'application/zip' }));

      for (const type of ['dragenter', 'dragover', 'drop']) {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...at }));
      }
    }, zip);

    await expect.poll(async () => (await scene()).project.joints?.length ?? 0, { timeout: 30000 }).toBe(2);

    const { parts, project } = await scene();
    const servos = parts.filter((p) => p.componentId === 'feetech-sts3215');

    expect(project.joints!.map((j) => j.id)).toEqual(DESK_ARM.joints.map((j) => j.id));
    expect(servos).toHaveLength(2);
    expect(project.joints!.map((j) => j.actuators)).toEqual(servos.map((s) => [s.id]));
    expect(project.servoCalibrations?.shoulder?.active).toBe(3);
  });
});
