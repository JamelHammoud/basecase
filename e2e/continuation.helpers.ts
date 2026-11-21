import { expect } from 'vitest';
import type { Page } from 'playwright-core';
import { touchTheDots } from '../src/cases/testing';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import type { StoredTry } from '../src/cases/tryFile';
import { shown, type App } from './harness';
import { endTryAt, loadFixtureRobot } from './driveChecks';

export async function call<T>(page: Page, route: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    async ({ route, arg }) => {
      const response = await fetch(`/api/bridge/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ arg }),
      });

      return response.json();
    },
    { route, arg },
  );
}

export async function recordSource(current: App) {
  const robot = fixtureRobots().find((value) => value.id === 'arm-3dof')!;
  const kase = touchTheDots(robot);

  await loadFixtureRobot(current.page, robot);

  const id = await current.page.evaluate(
    (kase) => (window as unknown as { __studio: { addCase: (value: unknown) => string } }).__studio.addCase(kase),
    kase,
  );

  await expect
    .poll(() =>
      current.page.evaluate(
        () =>
          (
            window as unknown as { __studio: { sceneRecord: () => { project: { cases?: Array<{ id: string }> } } } }
          ).__studio
            .sceneRecord()
            .project.cases?.map((value) => value.id) ?? [],
      ),
    )
    .toContain(id);
  await current.page
    .locator(shown('[role=tab]'))
    .filter({ hasText: /^Simulate$/ })
    .first()
    .click();
  await current.page
    .locator(shown('button'))
    .filter({ hasText: /^Try Reference$/ })
    .first()
    .click();
  await endTryAt(current.page, 1.5);
  await expect.poll(() => call<StoredTry[]>(current.page, 'tries-list')).toHaveLength(1);

  return (
    await call<StoredTry[]>(current.page, 'tries-manifests', [
      (await call<Array<{ id: string }>>(current.page, 'tries-list'))[0].id,
    ])
  )[0];
}

export async function openSaved(current: App, id: string) {
  const page = current.page;
  const done = page
    .locator(shown('button'))
    .filter({ hasText: /^Done$/ })
    .first();

  if (await done.count()) await done.click();

  const rail = page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]'));

  if ((await rail.getAttribute('aria-pressed')) !== 'true') await rail.click();

  await page.locator(shown('[data-testid="library-tries"] button')).first().click();
  await page.locator(shown(`[data-testid="try-tile"][data-try="${id}"]`)).click();
  await expect.poll(() => page.getByTestId('try-timeline').count()).toBe(1);
}
