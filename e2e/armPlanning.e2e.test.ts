import { afterAll, beforeAll, expect, it } from 'vitest';
import { openApp, type App } from './harness';
import { retainSelfContactSceneFiles } from './selfContactScene';
import { armSkillStore, obstructedReachWalkthrough, refusedReachWalkthrough, reopenArmSkill } from './armPlanningSteps';

let app: App;

beforeAll(async () => {
  app = await openApp({ scenes: [] });
  await armSkillStore(app);
  await retainSelfContactSceneFiles(app.page);
});

afterAll(async () => {
  await app?.close();
});

it('requests an obstructed reach through Skills, observes Try reaching its target and reopens the saved skill', async () => {
  await obstructedReachWalkthrough(app);
  await reopenArmSkill(app);
  expect(app.errors).toEqual([]);
});

it('reports a bounded obstructed refusal without retaining a skill', async () => {
  await refusedReachWalkthrough(app);
  expect(app.errors).toEqual([]);
});
