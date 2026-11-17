import { inject } from 'vitest';
import { componentSize } from '../src/data/components';
import { component } from '../src/wiring/fixtures';
import { electricalScenes } from '../src/wiring/electricalFixtures';
import { encodeSceneFile } from '../src/utils/sceneFile';
import { openApp, shown } from './harness';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../src/types/robotics';
import { openKitScene } from './kitScene';

export type Studio = { __studio: { sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings } } };

export async function command(page: Awaited<ReturnType<typeof openApp>>['page'], label: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByPlaceholder('Search commands').fill(label);
  await page.locator('button[data-idx]').filter({ hasText: label }).first().click();
}

export async function openRover(page: Awaited<ReturnType<typeof openApp>>['page']) {
  await openKitScene(page, { name: 'Blank', parts: [], project: DEFAULT_PROJECT }, inject('webUrl'));

  const scene = electricalScenes().find((entry) => entry.name === 'battery-rover')!.scene;
  const pan = {
    ...component('pan', 'dynamixel-xl330-m288'),
    dimensions: componentSize('dynamixel-xl330-m288'),
    position: [80, 50, 120] as [number, number, number],
  };
  const file = await encodeSceneFile({
    ...scene,
    parts: [...scene.parts, pan],
    name: 'Board rover',
    globalGoal: '',
    annotations: [],
  });
  const chooser = page.waitForEvent('filechooser');

  await command(page, 'Open Scene File');
  await (
    await chooser
  ).setFiles({ name: 'board-rover.basecase', mimeType: 'application/octet-stream', buffer: Buffer.from(file) });
  await page.getByRole('tab', { name: 'Board rover', exact: true }).click();
  await page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();
  await page.getByRole('button', { name: 'Define Board', exact: true }).click();
  await page.getByRole('textbox', { name: 'Width (X)', exact: true }).waitFor();
}
