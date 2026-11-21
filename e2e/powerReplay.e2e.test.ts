import { expect, it } from 'vitest';
import { importReplayScene, inspectCurrent, openBuildReplay, enterReplayResistance } from './powerReplayFlow';
import { openApp } from './harness';

it(
  'replays modeled current from Build, selects its limiting endpoint and compares an edited resistance',
  { retry: 0 },
  async () => {
    const app = await openApp();

    try {
      const fixture = await importReplayScene(app.page);

      const dialog = await openBuildReplay(app.page);

      await enterReplayResistance(dialog, fixture);
      await dialog.getByRole('button', { name: 'Replay', exact: true }).click();
      await dialog.locator('[data-replay-result]').waitFor();
      await dialog.getByRole('button', { name: 'Select Lowest Voltage', exact: true }).click();
      expect(await dialog.locator('[data-replay-result]').getAttribute('data-part')).toBe('motor2');
      expect(await dialog.locator('[data-replay-selection]').getAttribute('data-replay-selection')).toBe('motor2');
      expect(await dialog.locator('[data-replay-selection]').getAttribute('data-replay-time')).toBe('0');
      await expect
        .poll(() =>
          app.page.evaluate(() =>
            (window as unknown as { __studio: { selection: () => string[] } }).__studio.selection(),
          ),
        )
        .toEqual(['motor2']);
      await dialog.getByLabel('Source resistance (Ω)').fill('0.04');
      await dialog.getByRole('button', { name: 'Compare', exact: true }).click();
      await dialog.locator('[data-replay-comparison]').waitFor();
      expect(await dialog.locator('[data-replay-comparison]').getAttribute('data-trace')).toBe(
        await dialog.locator('[data-replay-result]').getAttribute('data-trace'),
      );
      expect(Number(await dialog.locator('[data-replay-comparison]').getAttribute('data-volts'))).toBeLessThan(
        Number(await dialog.locator('[data-replay-result]').getAttribute('data-volts')),
      );
      expect(app.posts.filter((p) => p.route.startsWith('robot-'))).toEqual([]);
      expect(await app.page.locator('[data-check="Electrical connections"]:visible').getAttribute('data-status')).toBe(
        'fail',
      );
      expect(app.errors).toEqual([]);
    } finally {
      await app.close();
    }
  },
);

it('reopens retained replay evidence and preserves it as historical after a wiring edit', { retry: 0 }, async () => {
  const app = await openApp();

  try {
    await importReplayScene(app.page, true);
    await inspectCurrent(app.page);

    const dialog = app.page.getByRole('dialog', { name: 'Current replay', exact: true });

    await dialog.locator('[data-replay-result]').waitFor();
    await expect.poll(() => dialog.getByRole('button', { name: 'Compare', exact: true }).isEnabled()).toBe(true);

    const fingerprint = await dialog.locator('[data-replay-result]').getAttribute('data-trace');

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await app.page.getByRole('button', { name: 'Edit Route', exact: true }).first().click();
    await app.page.getByRole('button', { name: 'Add Point', exact: true }).click();
    await inspectCurrent(app.page);
    await expect.poll(() => dialog.getByRole('status').innerText()).toContain('Historical evidence');
    expect(await dialog.getByRole('button', { name: 'Compare', exact: true }).isEnabled()).toBe(false);
    expect(await dialog.locator('[data-replay-result]').getAttribute('data-trace')).toBe(fingerprint);
    expect(app.posts.filter((p) => p.route.startsWith('robot-'))).toEqual([]);
    expect(app.errors).toEqual([]);
  } finally {
    await app.close();
  }
});
