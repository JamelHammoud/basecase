import { editableNets, routeIdentity, updateRoute } from '../src/wiring/routeEditing';
import { contactCommand as command, retainSelfContactSceneFiles } from './selfContactScene';
import { reopenCableScene, showCableBuildAlong, cableLines } from './cableEditingSteps';
import { afterEach, expect, it } from 'vitest';
import { component, sceneOf, servoJoints } from '../src/wiring/fixtures';
import { buildCheckPage, sceneRecord, studioLoad } from './buildCheckFixtures';
import { openApp, shown, type App } from './harness';

let app: App;

afterEach(async () => {
  await app?.close();
});

it('edits a Cable reach route with local anchors and stock, then restores it through undo and redo', async () => {
  app = await openApp();
  await retainSelfContactSceneFiles(app.page);

  const arm = servoJoints({ prefix: 'servo', componentId: 'feetech-sts3215', variant: 'c001', count: 2, limb: 'arm' });
  const parts = [
    component('adapter', 'waveshare-bus-servo-adapter-a'),
    ...arm.parts.map((part, i) => ({ ...part, position: [400 * (i + 1), 40, 0] as [number, number, number] })),
  ];
  const joints = arm.joints.map((joint) => ({ ...joint, range: [0, 0] as [number, number] }));

  const scene = sceneOf(parts, joints);
  const project = updateRoute(scene, routeIdentity(editableNets(scene)[0])!, {
    supplyId: 'waveshare-servo-cable-5264-300',
  });

  await studioLoad(app.page, { parts, project });
  await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

  const check = buildCheckPage(() => app.page);
  const reach = check.checkRow('Cable reach');

  await expect.poll(() => reach.getAttribute('data-status')).toBe('fail');
  await expect.poll(() => cableLines(app)).toContain('supply:waveshare-servo-cable-5264-300');
  await check.expand(reach, 'Cable reach');
  await reach.getByRole('button', { name: 'Edit Route', exact: true }).first().click();

  const editor = app.page.getByRole('region', { name: 'Cable reach', exact: true });

  await editor.getByRole('combobox', { name: 'Cable', exact: true }).selectOption('waveshare-servo-cable-5264-900');
  await editor.getByRole('button', { name: 'Add Point', exact: true }).click();
  await editor.getByRole('combobox', { name: 'Link', exact: true }).selectOption('adapter');
  await editor.getByRole('textbox', { name: 'Y', exact: true }).fill('80');
  await editor.getByRole('textbox', { name: 'Y', exact: true }).press('Enter');
  await expect.poll(() => editor.getByRole('textbox', { name: 'Y', exact: true }).inputValue()).toBe('80');
  await app.page.keyboard.press('Escape');

  const authored = (await sceneRecord(app.page)).project.wiring;

  await app.page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await sceneRecord(app.page)).project.wiring?.[0].anchors?.[0].position[1]).toBe(0);
  await app.page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await sceneRecord(app.page)).project.wiring?.[0].anchors?.length ?? 0).toBe(0);
  await app.page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await sceneRecord(app.page)).project.wiring).toEqual(project.wiring);
  await app.page.keyboard.press('ControlOrMeta+Shift+z');
  await expect
    .poll(async () => (await sceneRecord(app.page)).project.wiring?.[0].supplyId)
    .toBe('waveshare-servo-cable-5264-900');
  await app.page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => (await sceneRecord(app.page)).project.wiring?.[0].anchors?.length).toBe(1);
  await app.page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => (await sceneRecord(app.page)).project.wiring).toEqual(authored);
  await expect.poll(() => reach.getAttribute('data-status')).toBe('pass');
  await expect.poll(() => cableLines(app)).not.toContain('supply:waveshare-servo-cable-5264-300');
  await command(app, 'Export Scene');
  await reopenCableScene(app);
  await expect.poll(async () => (await sceneRecord(app.page)).project.wiring).toEqual(authored);
  await showCableBuildAlong(
    app,
    parts.map((part) => part.id),
  );
  expect(app.errors).toEqual([]);
});
