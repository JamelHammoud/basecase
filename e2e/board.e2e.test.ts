import { expect, it } from 'vitest';
import { openApp, shown } from './harness';
import { buildCheckPage } from './buildCheckFixtures';
import { openRover } from './boardFixture';

it('reports an outline shrink as a mechanical board blocker', async () => {
  const app = await openApp();

  try {
    await openRover(app.page);
    await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

    const edit = app.page.getByRole('button', { name: 'Edit Board', exact: true });

    expect(await edit.textContent()).toBe('Edit Board');
    await edit.click();
    await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).waitFor();
    await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).fill('5');
    await app.page.getByRole('textbox', { name: 'Width (X)', exact: true }).press('Enter');
    await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

    const row = buildCheckPage(() => app.page).checkRow('Board fit');

    await expect.poll(() => row.getAttribute('data-status')).toBe('fail');
  } finally {
    await app.close();
  }
});
