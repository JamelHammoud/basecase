import { expect } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import { caseCommand } from '../src/cases/caseTarget';
import type { Case } from '../src/cases/schema';
import type { Dataset } from '../src/datasets/datasetFile';
import type { SimModel } from '../src/sim/mjcfTypes';
import { fixtureRobot } from '../src/skills/fixtureModels';
import { teachingPolicy } from '../src/sim/fixtures/teachingPolicy';
import { triesSkill } from '../src/skills/triesTraining';
import { skillRecord, type SkillRecord } from '../src/skills/skillRecords';
import { skillHash, type Skill } from '../src/skills/artifacts';
import { sha256Hex } from '../src/skills/hash';
import { designOf } from '../src/skills/skillsRuntime';
import { buildRig } from '../src/utils/kinematics';
import { loadFixtureRobot } from './driveChecks';
import { shown, type App } from './harness';

interface State {
  activeCase: string | null;
  stats: { time: number } | null;
  joints: Record<string, { position: number }>;
  tries: Array<{ id: string; passed: boolean }>;
}

export interface TeachingStudio {
  addCase: (kase: Case) => string;
  fleetModel: () => Promise<SimModel>;
  seedFleetSkill: (record: SkillRecord, skill: Skill) => Promise<void>;
  simState: () => State;
  datasets: () => Dataset[];
  seedDatasetTry: (id: string, variant: number) => Promise<void>;
}

export const teachingState = (app: App) =>
  app.page.evaluate(() => (window as unknown as { __studio: TeachingStudio }).__studio.simState());
export const teachingButton = (app: App, name: string) => app.page.getByRole('button', { name, exact: true }).first();

export async function prepareTeaching(app: App) {
  await loadFixtureRobot(app.page, 'arm-3dof');

  const robot = fixtureRobot('arm-3dof');
  const made = buildCase(
    { goal: 'touch', world: 'floor' },
    builderRobot(buildRig(robot.joints, robot.parts), robot.parts),
  );

  if (!made.ok) throw new Error(made.problem);

  const kase = { ...made.kase, task: { ...made.kase.task, seconds: 30 } };

  await app.page.evaluate((value) => (window as unknown as { __studio: TeachingStudio }).__studio.addCase(value), kase);
  await expect.poll(async () => (await teachingState(app)).activeCase).toBe(kase.id);

  const model = await app.page.evaluate(() =>
    (window as unknown as { __studio: TeachingStudio }).__studio.fleetModel(),
  );
  const policy = teachingPolicy(model, caseCommand(kase));
  const madeSkill = triesSkill({
    model,
    kase,
    policy,
    design: designOf(model),
    origin: { method: 'ask-for-demo', cost: { wallS: 0, steps: 0 } },
    runs: {
      runs: 32,
      passes: 32,
      outcomes: [],
      medianMargin: 1,
      worstMargin: 1,
      commonFailure: null,
      failures: [],
      worstSeed: null,
      refusal: null,
      misfit: false,
    },
  });

  if (!madeSkill) throw new Error('Expected browser policy fixture');

  await app.page.route('**/api/bridge/skill?**', (route) => route.fulfill({ json: madeSkill.skill }));

  const record = skillRecord(madeSkill.skill, {
    kit: null,
    goal: kase.name,
    environment: madeSkill.environment,
    case: { id: kase.id, model: sha256Hex(model.xml) },
  });

  await app.page.evaluate(
    async ({ saved, skill }) =>
      (window as unknown as { __studio: TeachingStudio }).__studio.seedFleetSkill(saved, skill),
    { saved: record, skill: madeSkill.skill },
  );
  await app.page.getByRole('tab', { name: 'Simulate', exact: true }).click();

  return { source: skillHash(madeSkill.skill), policy };
}

export async function correctTwice(app: App, ending: 'stop' | 'reset' = 'stop') {
  await teachingButton(app, 'Try Policy').click();

  for (let i = 0; i < 2; i++) {
    await teachingButton(app, 'Take Control').click();
    await expect.poll(() => teachingButton(app, 'Resume Policy').isVisible()).toBe(true);
    await focusTeachingCanvas(app);

    const before = (await teachingState(app)).joints;

    await app.page.keyboard.down('w');

    try {
      await expect
        .poll(async () =>
          Object.entries((await teachingState(app)).joints).some(
            ([id, joint]) => Math.abs(joint.position - before[id].position) > 0.1,
          ),
        )
        .toBe(true);
    } finally {
      await app.page.keyboard.up('w');
    }

    await teachingButton(app, 'Resume Policy').click();
    await expect.poll(() => teachingButton(app, 'Take Control').isVisible()).toBe(true);
  }

  if (ending === 'reset') {
    await focusTeachingCanvas(app);
    await app.page.keyboard.press('r');
  } else await teachingButton(app, 'Stop Try').click();

  await expect.poll(async () => (await teachingState(app)).tries.length).toBe(1);

  return (await teachingState(app)).tries[0].id;
}

export async function teachingLibrary(app: App) {
  await app.page.locator(shown('nav[aria-label="Sidebar views"] button[aria-label="Library"]')).click();
  await app.page.locator(shown('[data-testid="library-tries"] button')).first().click();
}

export async function teachingCommand(app: App, name: string) {
  await app.page.keyboard.press('ControlOrMeta+k');
  await app.page.getByLabel('Search commands').fill(name);
  await app.page.locator(shown('button[data-idx]')).filter({ hasText: name }).first().click();
}

export async function focusTeachingCanvas(app: App) {
  const canvas = app.page.locator('canvas:not([inert] *):visible').first();
  const box = await canvas.boundingBox();

  if (!box) throw new Error('Expected the simulation canvas');

  await canvas.click({ position: { x: box.width * 0.65, y: box.height * 0.65 } });
}

export async function makeTeachingDataset(app: App, id: string) {
  await teachingLibrary(app);
  await expect.poll(() => app.page.locator(shown('[data-testid="try-tile"]')).count()).toBe(5);
  await expect.poll(() => app.page.locator(shown('[data-testid="try-tile"][aria-pressed="true"]')).count()).toBe(0);

  for (const member of [id, ...Array.from({ length: 4 }, (_, i) => `original-${i}`)])
    await app.page
      .locator(shown(`[data-testid="try-tile"][data-try="${member}"]`))
      .click({ modifiers: ['ControlOrMeta'] });

  await teachingCommand(app, 'Make Dataset');
  await expect.poll(() => app.page.getByTestId('dataset-pane').isVisible()).toBe(true);
  await app.page.locator(shown(`[data-testid="try-tile"][data-try="${id}"]`)).click({ button: 'right' });
  await app.page.getByRole('menuitem', { name: 'Use Corrections', exact: true }).click();
}
