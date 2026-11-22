import { expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { openApp, shown } from './harness';
import { workflowBackend } from './agentWorkflowBackend';
import { specToPart } from '../src/agent/agentScene';
import type { SavedSceneRecord } from '../src/types/robotics';

interface StudioWindow {
  __studio: {
    sceneRecord: () => SavedSceneRecord;
    selection: () => string[];
    projectPoints: (points: number[][]) => Array<{ x: number; y: number }>;
  };
  __workflowEmit: (event: object) => void;
  __workflowHold: boolean;
  __workflowRelease: () => void;
  __workflow: { held: unknown[]; terminated: number };
}

async function visitBlankScene(page: Page) {
  await page.keyboard.press('ControlOrMeta+t');
  await page.waitForFunction(() => (window as unknown as StudioWindow).__studio?.sceneRecord().parts.length === 0);
  await page.keyboard.press('Control+Shift+Tab');
  await page.waitForFunction(
    () => (window as unknown as StudioWindow).__studio?.sceneRecord().parts[0]?.id === 'part-0',
  );
}

it('edits through the composer while orbiting and using the Inspector, cancels pending geometry and reopens accepted edits', async () => {
  const app = await openApp();
  const { page } = app;
  const parts = Array.from({ length: 48 }, (_, i) =>
    specToPart({
      id: `part-${i}`,
      name: `Plate ${i}`,
      shape: 'box',
      position: [(i % 8) * 40, Math.floor(i / 8) * 40, 0],
      size: [20, 20, 10],
    }),
  );
  const record = {
    id: 'workflow-robot',
    name: 'Agent workflow',
    globalGoal: '',
    parts,
    annotations: [],
    updatedAt: '2026-11-20',
    partCount: parts.length,
  } as SavedSceneRecord;
  const backend = await workflowBackend(page, record);
  const emit = (requestId: string, payload: object) =>
    page.evaluate((event) => (window as unknown as StudioWindow).__workflowEmit(event), {
      type: 'agent-request',
      workspaceId: backend.workspace(),
      kind: 'apply',
      requestId,
      payload,
    });

  try {
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as StudioWindow).__studio));
    await page.getByRole('tab', { name: 'Agent', exact: true }).first().click();
    await page.locator(shown('textarea')).last().fill('Adjust this robot');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(backend.workspace).not.toBe('');
    await emit('workflow-accepted', { ops: [{ op: 'update', part: { id: 'part-1', name: 'Agent plate' } }] });
    await expect.poll(() => backend.responses.has('workflow-accepted')).toBe(true);
    expect(backend.responses.get('workflow-accepted')?.error).toBeUndefined();
    await page.evaluate(() => {
      (window as unknown as StudioWindow).__workflowHold = true;
    });
    await emit('workflow-pending', {
      ops: [
        {
          op: 'add',
          part: {
            id: 'cancelled-part',
            shape: 'cad_part',
            cad: {
              language: 'openscad',
              code: 'cube(10);',
              positions: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10],
              indices: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3],
            },
          },
        },
      ],
    });
    await page.waitForFunction(() => (window as unknown as StudioWindow).__workflow.held.length > 0);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.getByText('Plate 0', { exact: true }).first().click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as StudioWindow).__studio.selection()))
      .toEqual(['part-0']);
    await page.getByRole('tab', { name: 'Inspect', exact: true }).first().click();
    await page.getByLabel('Position X', { exact: true }).fill('37');
    await page.getByLabel('Position X', { exact: true }).press('Enter');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as StudioWindow).__studio.sceneRecord().parts[0].position[0]))
      .toBe(37);

    const canvas = page.locator(shown('canvas')).first();
    const bounds = (await canvas.boundingBox())!;
    const before = await page.evaluate(
      () => (window as unknown as StudioWindow).__studio.projectPoints([[0, 0, 0]])[0],
    );

    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(60, 15);
    await page.waitForFunction((old) => {
      const now = (window as unknown as StudioWindow).__studio.projectPoints([[0, 0, 0]])[0];

      return Math.abs(now.x - old.x) > 0.1 || Math.abs(now.y - old.y) > 0.1;
    }, before);
    await canvas.click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('ControlOrMeta+z');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as StudioWindow).__studio.sceneRecord().parts[0].position[0]))
      .toBe(0);
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as StudioWindow).__studio.sceneRecord().parts[0].position[0]))
      .toBe(37);
    await visitBlankScene(page);
    await page.getByRole('tab', { name: 'Agent working Agent', exact: true }).click();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.evaluate(() => (window as unknown as StudioWindow).__workflowRelease());
    await expect.poll(() => backend.responses.has('workflow-pending')).toBe(true);
    expect(backend.responses.get('workflow-pending')?.error).toBeTruthy();
    await expect.poll(() => backend.saved()?.parts.find((part) => part.id === 'part-0')?.position[0]).toBe(37);
    expect(backend.saved().parts.some((part) => part.id === 'cancelled-part')).toBe(false);
    expect(backend.reopen().parts.find((part) => part.id === 'part-1')?.name).toBe('Agent plate');
    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as StudioWindow).__studio));
    await expect
      .poll(() => page.evaluate(() => (window as unknown as StudioWindow).__studio.sceneRecord().parts[0].position[0]))
      .toBe(37);
  } finally {
    backend.finish();
    await app.close();
    backend.close();
  }
});
