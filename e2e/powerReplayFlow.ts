import { expect, inject } from 'vitest';
import type { Page, Locator } from 'playwright-core';
import { encodeSceneFile } from '../src/utils/sceneFile';
import { storedWalk } from '../src/workspace/storedWalk';
import { retainPowerReplay } from '../src/wiring/powerReplayRecord';
import { replayFixture } from '../src/wiring/powerReplay.fixtures';

export async function importReplayScene(page: Page, retained = false) {
  const webUrl = inject('webUrl');

  if (new URL(page.url()).origin !== new URL(webUrl).origin) {
    await page.goto(webUrl);
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));
  }

  const fixture = replayFixture(2);

  const walk = { ...fixture.input.walk, ...storedWalk(fixture.input.walk, fixture.input.parts, fixture.input.project) };

  Object.assign(fixture.input.walk, walk);

  const baseline = retained ? await retainPowerReplay(fixture) : undefined;
  const project = {
    ...fixture.input.project,
    walk,
    ...(baseline ? { powerReplay: { baseline } } : {}),
  };
  const bytes = await encodeSceneFile({
    name: 'Replay pan-tilt',
    parts: fixture.input.parts,
    project,
    globalGoal: '',
    annotations: [],
  });

  await page.evaluate(
    (file) =>
      (
        window as unknown as { __studio: { pickFiles: (files: Array<{ name: string; base64: string }>) => void } }
      ).__studio.pickFiles([file]),
    { name: 'replay-pan-tilt.basecase', base64: Buffer.from(bytes).toString('base64') },
  );

  await page.keyboard.press('ControlOrMeta+k');
  await page.getByLabel('Search commands').fill('Import');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.waitForFunction(() =>
    (window as unknown as { __studio: { parts: () => Array<{ id: string }> } }).__studio
      .parts()
      .some((p) => p.id === 'motor2'),
  );

  return fixture;
}

export async function inspectCurrent(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByLabel('Search commands').fill('Inspect Current');
  await page.keyboard.press('Enter');
}

export async function openBuildReplay(page: Page) {
  await page.locator('[role=tab]:not([inert] *):visible', { hasText: 'Build' }).first().click();

  const row = page.locator('[data-check="Electrical connections"]:visible');

  await row.getByRole('button', { name: /^Electrical connections/ }).click();
  await row.getByRole('button', { name: 'Inspect Current', exact: true }).click();

  return page.getByRole('dialog', { name: 'Current replay', exact: true });
}

export async function enterReplayResistance(dialog: Locator, fixture: ReturnType<typeof replayFixture>) {
  const source = dialog.getByLabel('Source resistance (Ω)');

  await source.fill('');
  await source.pressSequentially('0.02');
  expect(await source.inputValue()).toBe('0.02');
  await dialog.getByLabel('Source evidence').fill('Generated source control');
  await dialog.getByLabel('Temperature (°C)', { exact: true }).first().fill('20');
  await dialog.getByLabel('Maximum current (A)').fill('100');
  await dialog.getByLabel('Minimum voltage (V)').fill('0');
  await dialog.getByLabel('Junction evidence').fill('Generated paired harness and ideal junctions');

  for (const cable of fixture.cables) {
    const fields = dialog.locator('[data-replay-cable]').filter({ hasText: cable.name });

    await fields.getByLabel('Outgoing resistance (Ω)').fill('0.01');
    await fields.getByLabel('Return resistance (Ω)').fill('0.015');
    await fields.getByLabel('Temperature (°C)').fill('20');
    await fields.getByLabel('Evidence', { exact: true }).fill('Generated conductor control');
  }

  await dialog.getByLabel('Load current (A)').fill('0.1');
  await dialog.getByLabel('Load evidence').fill('Prescribed adapter control');
}
