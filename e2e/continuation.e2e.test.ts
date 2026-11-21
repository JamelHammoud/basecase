import { afterEach, expect, it } from 'vitest';
import { decodeRecording } from '../src/cases/recordingFile';
import { bytesToBase64 } from '../src/utils/base64';
import type { StoredTry } from '../src/cases/tryFile';
import { openApp, shown, type App } from './harness';
import { endTryAt } from './driveChecks';
import { call, recordSource, openSaved } from './continuation.helpers';

let app: App | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

it('branches a newly scripted Library try from the timeline and saves a manual recovery', async () => {
  app = await openApp();

  const source = await recordSource(app);
  const original = (await call<{ data: string }>(app.page, 'tries-recording', source.id)).data;

  await openSaved(app, source.id);
  await app.page.getByLabel('Checkpoint', { exact: true }).selectOption('50');
  await app.page.getByTestId('try-timeline').press('ArrowRight');
  await expect.poll(() => app!.page.getByTestId('try-timeline').getAttribute('data-frame')).toBe('51');
  expect(await app.page.getByLabel('Checkpoint', { exact: true }).inputValue()).toBe('');
  await app.page.getByLabel('Checkpoint', { exact: true }).selectOption('50');
  await app.page.getByRole('button', { name: 'Branch Try', exact: true }).click();
  await expect.poll(() => app!.page.getByTestId('try-clock').count()).toBeGreaterThan(0);
  await app.page.keyboard.down('a');

  try {
    await endTryAt(app.page, 1.4);
  } finally {
    await app.page.keyboard.up('a');
  }

  await expect.poll(() => call<Array<{ id: string }>>(app!.page, 'tries-list')).toHaveLength(2);

  const all = await call<Array<{ id: string }>>(app.page, 'tries-list');
  const child = (
    await call<StoredTry[]>(app.page, 'tries-manifests', [all.find((value) => value.id !== source.id)!.id])
  )[0];
  const bytes = (await call<{ data: string }>(app.page, 'tries-recording', child.id)).data;
  const parentRecording = decodeRecording(new Uint8Array(Buffer.from(original, 'base64')))!;
  const childRecording = decodeRecording(new Uint8Array(Buffer.from(bytes, 'base64')))!;

  expect(child.sourceTry).toBe(source.id);
  expect(child.branch).toMatchObject({ version: 1, frame: 50 });
  expect(child.branch!.time).toBeCloseTo(1, 5);
  expect(childRecording.qpos.subarray(0, 51 * parentRecording.nq)).toEqual(
    parentRecording.qpos.subarray(0, 51 * parentRecording.nq),
  );
  expect(childRecording.qpos.subarray(51 * parentRecording.nq)).not.toEqual(
    parentRecording.qpos.subarray(51 * parentRecording.nq, childRecording.frames * parentRecording.nq),
  );
  expect((await call<{ data: string }>(app.page, 'tries-recording', source.id)).data).toBe(original);
  await openSaved(app, child.id);
  expect(app.errors).toEqual([]);
});

it('keeps a legacy try inspectable and refuses a source recording changed after timeline opening', async () => {
  app = await openApp();

  const source = await recordSource(app);
  const raw = (await call<{ data: string }>(app.page, 'tries-recording', source.id)).data;
  const recording = decodeRecording(new Uint8Array(Buffer.from(raw, 'base64')))!;

  await openSaved(app, source.id);
  await app.page.getByLabel('Checkpoint', { exact: true }).selectOption('50');

  const { encodeRecording } = await import('../src/cases/recordingFile');
  const changed = encodeRecording({ ...recording, continuation: undefined });

  await call(app.page, 'tries-save', { manifest: source, recording: bytesToBase64(changed) });
  await app.page.getByRole('button', { name: 'Branch Try', exact: true }).click();
  await expect
    .poll(() => app!.page.locator('body').innerText())
    .toContain('Record a new scripted try with this Case and robot.');
  await app.page
    .locator(shown('button'))
    .filter({ hasText: /^Done$/ })
    .first()
    .click();
  await app.page.locator(shown(`[data-testid="try-tile"][data-try="${source.id}"]`)).click();
  await expect.poll(() => app!.page.getByTestId('try-timeline').count()).toBe(1);
  expect(await app.page.getByLabel('Checkpoint', { exact: true }).count()).toBe(0);
  expect(await app.page.getByRole('button', { name: 'Branch Try', exact: true }).count()).toBe(0);
});

it('cancels a manual branch when switching scenes and leaves the retained source unchanged', async () => {
  app = await openApp();

  const source = await recordSource(app);
  const original = (await call<{ data: string }>(app.page, 'tries-recording', source.id)).data;

  await openSaved(app, source.id);
  await app.page.getByLabel('Checkpoint', { exact: true }).selectOption('50');
  await app.page.getByRole('button', { name: 'Branch Try', exact: true }).click();
  await expect.poll(() => app!.page.getByTestId('try-clock').count()).toBeGreaterThan(0);
  await app.page.keyboard.press('ControlOrMeta+t');
  await expect.poll(() => app!.page.getByTestId('try-clock').count()).toBe(0);
  expect(await call<StoredTry[]>(app.page, 'tries-list')).toHaveLength(1);
  expect((await call<{ data: string }>(app.page, 'tries-recording', source.id)).data).toBe(original);
  expect(app.errors).toEqual([]);
});
