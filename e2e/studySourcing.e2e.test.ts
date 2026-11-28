import { afterEach, expect, it } from 'vitest';
import { listPurchases, savePurchase } from '../electron/backend/purchases.mjs';
import { encodeSceneFile, sharedScene } from '../src/utils/sceneFile';
import { openApp, shown, type App } from './harness';
import { supportSceneStorage } from './sketchSupport.helpers';
import { expectPanelReadable } from './appearanceLayout';
import { sourcingConfigurationLayout, compareSourcingOffers } from './studySourcingLayout';
import {
  routeSourcingPurchases,
  openSourcingStudy,
  savedSourcingStudy,
  sourcingBrowserFixture,
  studyCommand,
  type SourcingHook,
} from './studySourcingSteps';

let app: App | undefined;
let fixture: Awaited<ReturnType<typeof sourcingBrowserFixture>> | undefined;

afterEach(async () => {
  await app?.close();
  fixture?.close();
});

it('compares late and on-time actuator offers beside Checks from the Study command', { retry: 0 }, async () => {
  fixture = await sourcingBrowserFixture();
  fixture.requirements.quantity = 20;
  app = await openApp({ purchases: fixture.purchases });

  const { page } = app;

  await routeSourcingPurchases(page, fixture);
  await openSourcingStudy(page, fixture);
  await sourcingConfigurationLayout(page);
  await page.getByRole('button', { name: 'Run Study', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = (window as unknown as { __studio: SourcingHook }).__studio.studyState();

        return !state.running && state.record?.rows.length === 2;
      }),
    )
    .toBe(true);

  const rows = page.getByRole('table', { name: 'Study designs' }).getByTestId('study-row');
  const late = rows.filter({ hasText: 'Arrives after required date' });
  const onTime = rows.filter({ hasText: 'Purchasing evidence complete' });

  expect(await late.count()).toBe(1);
  expect(await onTime.count()).toBe(1);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __studio: SourcingHook }).__studio
        .studyState()
        .record!.rows.every((row) => row.checks.length > 0 && !row.error),
    ),
  ).toBe(true);
  await late.click();
  await expectPanelReadable(late.getByTestId('study-purchasing'));
  expect(await late.getByTestId('study-purchasing').textContent()).toContain('https://example.com/offers/');
  await onTime.click();
  await expectPanelReadable(onTime.getByTestId('study-purchasing'));
  expect(await onTime.getByTestId('study-purchasing').textContent()).toContain('Purchasing arrival estimate');
  await onTime.getByRole('button', { name: 'Supplier Offers', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Supplier offers', exact: true });

  expect(await dialog.textContent()).toContain('Fixture supplier');
  expect(await dialog.getByRole('textbox', { name: 'Destination', exact: true }).inputValue()).toBe(
    fixture.requirements.destination,
  );
  expect(await dialog.getByLabel('Required arrival date', { exact: true }).inputValue()).toBe(
    fixture.requirements.requiredBy,
  );
  expect(
    await dialog
      .getByRole('button', { name: 'Select Fixture supplier component:feetech-sts3215|c018', exact: true })
      .locator('../..')
      .getByText('5 pack 50 USD', { exact: true })
      .count(),
  ).toBe(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await compareSourcingOffers(page);
  expect(app.errors).toEqual([]);
});

it(
  'reopens historical purchasing evidence and refuses Apply after the selected offer changes',
  { retry: 0 },
  async () => {
    fixture = await sourcingBrowserFixture();
    app = await openApp({ purchases: fixture.purchases });

    const { page } = app;

    await routeSourcingPurchases(page, fixture);
    await supportSceneStorage(page);

    const study = await savedSourcingStudy(fixture);
    const bytes = await encodeSceneFile(
      sharedScene({
        name: 'Saved shoulder comparison',
        globalGoal: '',
        parts: fixture.scene.parts,
        project: { ...fixture.scene.project, study },
      }),
    );
    const key = 'component:feetech-sts3215|c018';
    const changed = listPurchases(fixture.dir)[key];

    changed.supplierOffers!.offers[0].offer.expiresAt = '2020-01-01T00:00:00Z';
    savePurchase(fixture.dir, { key, record: changed });
    await page.evaluate(
      (base64) =>
        (window as unknown as { __studio: SourcingHook }).__studio.pickFiles([{ name: 'comparison.basecase', base64 }]),
      Buffer.from(bytes).toString('base64'),
    );
    await page.keyboard.press('Meta+k');
    await page.getByLabel('Search commands').fill('Import');
    await page
      .locator(shown('button[data-idx]'))
      .filter({ hasText: /^Import$/ })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __studio: SourcingHook }).__studio.studyState().record?.sourcing?.id,
        ),
      )
      .toBe(study.sourcing.id);
    await studyCommand(page);

    const row = page
      .getByRole('table', { name: 'Study designs' })
      .getByTestId('study-row')
      .filter({ hasText: 'Purchasing evidence complete' });

    await row.click();
    expect(await row.getByTestId('study-purchasing').textContent()).toContain(study.sourcing.evaluatedAt);
    expect(
      await page.evaluate(() =>
        (window as unknown as { __studio: SourcingHook }).__studio
          .studyState()
          .record!.rows.map((item) => item.purchasing),
      ),
    ).toEqual(JSON.parse(JSON.stringify(study.rows.map((item) => item.purchasing))));

    const before = await page.evaluate(() => (window as unknown as { __studio: SourcingHook }).__studio.sceneRecord());

    await row.hover();
    await row.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.getByRole('status').getByText('Run Study again to apply a design.', { exact: true }).waitFor();

    const after = await page.evaluate(() => (window as unknown as { __studio: SourcingHook }).__studio.sceneRecord());

    expect(after.parts).toEqual(before.parts);
    expect({ ...after.project, buildGuide: undefined }).toEqual({ ...before.project, buildGuide: undefined });
    expect(app.errors).toEqual([]);
  },
);
