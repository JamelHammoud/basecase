import { afterAll, beforeAll, expect, it } from 'vitest';
import type { SimModel } from '../src/sim/mjcfTypes';
import { currentDesign, skillFreshness, skillHash, type Skill } from '../src/skills/artifacts';
import { fixtureModel, fixtureRobot } from '../src/skills/fixtureModels';
import { readyKitSource, kitPolicy } from '../src/skills/kitSourceFixtures';
import { mapKitSkill } from '../src/skills/hubSkill';
import { kitEnvironment } from '../src/skills/kitEnvironment';
import { kitJob } from '../src/skills/kitJob';
import { skillRecord, type SkillRecord } from '../src/skills/skillRecords';
import { DEFAULT_PROJECT, type ProjectSettings } from '../src/types/robotics';
import { openApp, partCount, shown, type App } from './harness';
import { stubWebTrainWorker, type KitJob } from './webTrainWorker';

interface Studio {
  load: (record: unknown) => void;
  fleetModel: () => Promise<SimModel>;
  seedFleetSkill: (record: SkillRecord) => Promise<void>;
  pauseKitBackground: () => void;
  stubTrainer: (policy: unknown) => void;
  sceneRecord: () => { project: ProjectSettings };
}

interface TestWindow {
  __studio: Studio;
}

let app: App;
const artifacts = new Map<string, string>();
const requests: KitJob[] = [];

beforeAll(async () => {
  app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } });
  await stubWebTrainWorker(app.page, requests);
  await app.page.route('**/api/bridge/skill?**', (route) => {
    const text = artifacts.get(new URL(route.request().url()).searchParams.get('hash') ?? '') ?? 'null';

    return route.fulfill({ status: 200, contentType: 'application/json', body: text });
  });
  await app.page.route('**/api/bridge/skill-save', (route) => {
    const { hash, text } = route.request().postDataJSON() as { hash: string; text: string };

    artifacts.set(hash, text);

    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
});

afterAll(async () => {
  await app?.close();
});

it('retrains an edited hexapod from its saved Stand row and retains fresh target evidence', async () => {
  const robot = fixtureRobot('hexapod');
  const parts = robot.parts.filter((part) => !part.id.startsWith('leg0_'));
  const joints = robot.joints.filter((joint) => !joint.id.startsWith('leg0_'));
  const sourceModel = fixtureModel('hexapod');
  const source = readyKitSource(sourceModel);
  const record = skillRecord(source, { kit: 'stand', model: sourceModel });
  const original = JSON.stringify(source);

  artifacts.set(record.hash, original);
  await app.page.evaluate((scene) => (window as unknown as TestWindow).__studio.load(scene), {
    name: 'Edited hexapod',
    parts,
    project: { ...DEFAULT_PROJECT, joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length - 3);
  await app.page.evaluate(() => (window as unknown as TestWindow).__studio.pauseKitBackground());

  const target = await app.page.evaluate(() => (window as unknown as TestWindow).__studio.fleetModel());
  const completed = kitPolicy(kitJob(target, 'stand', { minutes: 1, seed: 1 }));

  await app.page.evaluate((policy) => (window as unknown as TestWindow).__studio.stubTrainer(policy), completed);
  await app.page.evaluate((saved) => (window as unknown as TestWindow).__studio.seedFleetSkill(saved), record);
  await app.page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();

  const row = app.page.locator(shown('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();

  await row.getByRole('button', { name: 'Train', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);

  expect(requests[0].warm?.from).toBe(record.hash);
  expect(requests[0].warm?.initialMinutes).toBe(1);

  if (source.controller.kind !== 'policy') throw new Error('Expected policy fixture');

  const expected = mapKitSkill({ ...source, controller: source.controller }, record.kitSource!, target);

  expect(requests[0].warm?.policy).toEqual(expected.warm.policy);
  await expect.poll(() => row.getByRole('button', { name: 'Try', exact: true }).count()).toBe(1);

  const retained = await app.page.evaluate(
    () => (window as unknown as TestWindow).__studio.sceneRecord().project.skills ?? [],
  );
  const updated = retained.find((entry) => entry.warmStartFrom === record.hash)!;
  const saved = JSON.parse(artifacts.get(updated.hash)!) as Skill;

  expect(updated.hash).not.toBe(record.hash);
  expect(skillHash(saved)).toBe(updated.hash);
  expect(
    skillFreshness(
      saved,
      currentDesign({ design: target.robots[0].key, model: target, environment: kitEnvironment(target, 'stand') }),
    ),
  ).toBe('fresh');
  expect(artifacts.get(record.hash)).toBe(original);
  expect(app.errors).toEqual([]);
});
