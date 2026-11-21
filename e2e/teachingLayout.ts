import { expect } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import { expectPanelReadable } from './appearanceLayout';
import type { App } from './harness';
import { Buffer } from 'node:buffer';
import { decodeRecording, encodeRecording } from '../src/cases/recordingFile';
import { ownershipIntervals } from '../src/sim/teachingRecording';

export async function expectOwnershipReadable(ownership: Locator) {
  try {
    await expectPanelReadable(ownership);
  } catch (cause) {
    const geometry = await ownership.evaluate((root) => {
      const range = document.createRange();
      const bounds = (element: Element) => element.getBoundingClientRect().toJSON();

      return {
        root: bounds(root),
        list: bounds(root.querySelector('dl')!),
        rows: [...root.querySelectorAll('dt, dd')].map((element) => {
          range.selectNodeContents(element);

          return {
            text: element.textContent,
            box: bounds(element),
            lines: [...range.getClientRects()].map((rect) => rect.toJSON()),
            font: getComputedStyle(element).font,
          };
        }),
      };
    });

    throw new Error(`Ownership text geometry: ${JSON.stringify(geometry)}`, { cause });
  }
}

export async function expectTeachingLayout(page: Page, owner?: 'policy' | 'operator') {
  const section = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Try', exact: true }) })
    .filter({ visible: true });

  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expectPanelReadable(section);

  if (!owner) {
    const manual = (await section.getByRole('button', { name: 'Try It', exact: true }).boundingBox())!;
    const policy = (await section.getByRole('button', { name: 'Try Policy', exact: true }).boundingBox())!;

    expect(manual.y + manual.height).toBeLessThanOrEqual(policy.y);

    return;
  }

  expect(await section.getByRole('button', { name: 'Try Policy', exact: true }).count()).toBe(0);
  expect(await section.getByRole('button', { name: 'Try It', exact: true }).count()).toBe(0);

  const stop = (await section.getByRole('button', { name: 'Stop Try', exact: true }).boundingBox())!;
  const handoff = (await section
    .getByRole('button', { name: owner === 'operator' ? 'Resume Policy' : 'Take Control', exact: true })
    .boundingBox())!;

  expect(stop.y + stop.height).toBeLessThanOrEqual(handoff.y);
}

export async function expectOwnershipScrolling(app: App, id: string) {
  const timeline = app.page.getByTestId('try-timeline');

  await app.page.getByTestId('case-run-area').getByRole('button', { name: 'Done', exact: true }).press('Enter');
  await expect.poll(() => timeline.count()).toBe(0);
  await manyTeachingIntervals(app, id);
  await app.page.setViewportSize({ width: app.page.viewportSize()!.width, height: 720 });
  await app.page.locator(`[data-testid="try-tile"][data-try="${id}"]:visible`).click();

  const ownership = app.page.getByTestId('try-ownership');
  const list = ownership.locator('dl');

  await expect.poll(() => ownership.locator('[data-owner]').count()).toBe(40);
  await expectOwnershipReadable(ownership);

  const bounds = (await timeline.boundingBox())!;
  const canvas = (await app.page.locator('canvas:not([inert] *):visible').first().boundingBox())!;

  expect(bounds.y).toBeGreaterThanOrEqual(canvas.y);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(canvas.y + canvas.height);
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  const frame = await timeline.getAttribute('data-frame');

  await list.focus();
  await list.press('End');
  await expect
    .poll(() => list.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop))
    .toBeLessThanOrEqual(1);

  const last = (await ownership.locator('[data-owner]').last().boundingBox())!;
  const visible = (await list.boundingBox())!;

  expect(last.y).toBeGreaterThanOrEqual(visible.y - 1);
  expect(last.y + last.height).toBeLessThanOrEqual(visible.y + visible.height + 1);
  expect(await timeline.getAttribute('data-frame')).toBe(frame);
}

async function manyTeachingIntervals(app: App, id: string) {
  const saved = app.posts
    .filter((post) => post.route === 'tries-save')
    .map((post) => post.body as { arg: { manifest: { id: string }; recording: string } })
    .find((post) => post.arg.manifest.id === id)!;
  const recording = decodeRecording(Buffer.from(saved.arg.recording, 'base64'))!;
  const count = recording.teaching!.boundaries;

  expect(count).toBeGreaterThan(40);
  recording.actionOwner = Uint8Array.from({ length: count }, (_, i) => Math.floor((i * 40) / count) % 2);
  recording.teaching!.ownership = ownershipIntervals(recording);

  const data = Buffer.from(encodeRecording(recording)).toString('base64');

  await app.page.route('**/api/bridge/tries-recording', (route) =>
    route.request().postDataJSON().arg === id ? route.fulfill({ json: { data } }) : route.fallback(),
  );
}
