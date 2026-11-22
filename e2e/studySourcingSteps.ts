import { stubKitGuideWorker } from './kitGuideWorker';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { listPurchases, savePurchase } from '../electron/backend/purchases.mjs';
import { servoArm } from '../src/sim/fixtures/servoArm';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../src/types/robotics';
import { createStudyGrader } from '../src/study/grade';
import { sourcingSnapshot } from '../src/study/sourcing';
import { sourcingEvidence, sourcingKnob, sourcingScene, SOURCING_REQUIREMENTS } from '../src/study/sourcingFixtures';
import { runStudy, studyFingerprint } from '../src/study/study';
import type { StudyKnob, StudyRecord } from '../src/study/types';
import { shown } from './harness';

export interface SourcingHook {
  load: (scene: { name: string; parts: ScenePart[]; project: ProjectSettings }) => void;
  sceneRecord: () => { parts: ScenePart[]; project: ProjectSettings };
  configureStudy: (knobs: StudyKnob[]) => void;
  studyState: () => { record: StudyRecord | null; running: boolean };
  pickFiles: (files: Array<{ name: string; base64: string }>) => void;
}

export async function sourcingBrowserFixture() {
  const robot = servoArm();
  const scene = sourcingScene(robot.parts, { ...DEFAULT_PROJECT, joints: robot.joints });
  const now = new Date().toISOString();
  const day = (offset: number) => new Date(Date.parse(now) + offset * 86400000).toISOString().slice(0, 10);
  const requirements = { ...SOURCING_REQUIREMENTS, requiredBy: day(7) };
  const purchases = await sourcingEvidence(scene, now);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-sourcing-'));

  for (const [key, record] of Object.entries(purchases)) {
    const offer = record.supplierOffers!.offers[0].offer;

    offer.arrivalEarliest = day(2);
    offer.arrivalLatest = key === 'component:feetech-sts3215|c001' ? day(10) : day(4);
    savePurchase(dir, { key, record });
  }

  return {
    scene,
    requirements,
    purchases: listPurchases(dir),
    now,
    dir,
    close: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

export async function routeSourcingPurchases(page: Page, fixture: Awaited<ReturnType<typeof sourcingBrowserFixture>>) {
  await stubKitGuideWorker(page);
  await page.route('**/api/bridge/purchases', (route) => route.fulfill({ json: listPurchases(fixture.dir) }));
  await page.route('**/api/bridge/purchase-save', (route) =>
    route.fulfill({ json: savePurchase(fixture.dir, route.request().postDataJSON()) }),
  );
}

export async function openSourcingStudy(page: Page, fixture: Awaited<ReturnType<typeof sourcingBrowserFixture>>) {
  await page.evaluate(
    ({ scene, knob }) => {
      const hook = (window as unknown as { __studio: SourcingHook }).__studio;

      hook.load({ name: 'Shoulder alternatives', parts: scene.parts, project: scene.project });
      hook.configureStudy([knob]);
    },
    {
      scene: fixture.scene,
      knob: { ...sourcingKnob(fixture.scene), values: sourcingKnob(fixture.scene).values.slice(0, 1) },
    },
  );
  await studyCommand(page);
  await page.getByRole('combobox', { name: 'Add Servo', exact: true }).selectOption('component:feetech-sts3215|c018');
  await page.getByRole('switch', { name: 'Purchasing', exact: true }).click();
  await page.getByRole('textbox', { name: 'Destination', exact: true }).fill(fixture.requirements.destination);
  await page.getByLabel('Required arrival date', { exact: true }).fill(fixture.requirements.requiredBy);

  const quantity = page.getByRole('textbox', { name: 'Quantity', exact: true });

  await quantity.fill(String(fixture.requirements.quantity));
  await quantity.press('Tab');
}

export async function studyCommand(page: Page) {
  await page.keyboard.press('Meta+k');
  await page.getByLabel('Search commands').fill('Study');
  await page
    .locator(shown('button[data-idx]'))
    .filter({ hasText: /^Study$/ })
    .click();
}

export async function savedSourcingStudy(fixture: Awaited<ReturnType<typeof sourcingBrowserFixture>>) {
  const { scene, requirements, purchases, now } = fixture;
  const sourcing = sourcingSnapshot(requirements, purchases, now);
  const knobs = [sourcingKnob(scene)];
  const grader = createStudyGrader();

  try {
    const current = grader.grade({ ...scene, sourcing }, { knobs: [], selection: [], purchases });
    const rows = await runStudy(
      { ...scene, sourcing },
      { knobs, purchases, grade: async (candidate, options) => grader.grade(candidate, options) },
    );

    return {
      sourcing,
      knobs,
      current,
      rows,
      total: 2,
      seed: 1,
      baseKey: studyFingerprint(scene.parts, scene.project),
      base: { parts: scene.parts, project: scene.project },
    } satisfies StudyRecord;
  } finally {
    grader.dispose();
  }
}
