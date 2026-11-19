import loadMujoco from '@mujoco/mujoco';
import { expect } from 'vitest';
import type { Skill } from '../src/skills/artifacts';
import type { SimModel } from '../src/sim/mjcfTypes';
import { dividerInput } from '../src/skills/armMotionFixtures';
import { armReachRequest } from '../src/skills/armPlanningPipeline';
import type { DraftInput } from '../src/skills/teach';
import { partCount, shown, type App } from './harness';
import { contactCommand } from './selfContactScene';

interface Studio {
  load: (record: unknown) => void;
  setPose: (values: Record<string, number>) => void;
  fleetModel: () => Promise<SimModel>;
  addCase: (kase: unknown) => string;
  stageSkillCase: (id: string) => void;
  agentRequest: (kind: string, payload: unknown) => Promise<{ text: string }>;
  skillBodyPosition: (part: string) => number[] | null;
  simState: () => { playing: boolean; stats: { time: number } | null };
  lastDownload: () => { name: string; base64: string } | null;
  clear: () => void;
  dropFiles: (files: unknown[]) => Promise<void>;
}

export type ArmCapture = (state: 'prompt' | 'ready' | 'reached' | 'refused') => Promise<void>;

const row = (app: App) =>
  app.page
    .locator(shown('[data-testid="skill-row"]'))
    .filter({ hasText: 'Reach around the divider to the other side' });

export async function armSkillStore(app: App) {
  const skills = new Map<string, Skill>();

  await app.page.route(/\/api\/bridge\/(skill|skill-save)(\?|$)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith('skill-save')) {
      const body = request.postDataJSON() as { hash: string; text: string };

      skills.set(body.hash, JSON.parse(body.text));
      await route.fulfill({ json: { ok: true } });

      return;
    }

    await route.fulfill({ json: skills.get(url.searchParams.get('hash') ?? '') ?? null });
  });

  return skills;
}

export async function loadArmScene(app: App) {
  const input = dividerInput();

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: 'Reach around a divider',
    parts: input.parts,
    project: { ...input.project, pose: input.pose },
  });
  await expect.poll(() => partCount(app.page)).toBe(input.parts.length);
  await app.page.evaluate(
    (pose) => (window as unknown as { __studio: Studio }).__studio.setPose(pose),
    input.pose.values,
  );
  await app.page.evaluate(
    (world) =>
      (window as unknown as { __studio: Studio }).__studio.addCase({
        formatVersion: 1,
        id: 'divider-case',
        name: 'Divider reach',
        brief: 'Reach around the divider.',
        slot: { needs: ['arm'], binding: { endEffector: { part: 'link2', point: [0, 35, 0] } } },
        world: {
          objects: world.map((part) => ({
            id: part.id,
            name: part.name,
            kind: 'box',
            position: part.position,
            rotation: part.rotation,
            size: [part.dimensions.width, part.dimensions.height, part.dimensions.depth],
            color: part.color,
            behavior: 'static',
          })),
        },
        controls: [],
        reference: { timeline: [] },
        task: {
          seconds: 10,
          probes: [],
          contract: {
            version: 1,
            success: {
              always: { window: 'whole', state: { atom: { expr: { signal: 'time' }, cmp: '<', value: 20, scale: 1 } } },
            },
            failures: [],
          },
        },
      }),
    input.world,
  );
  await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.stageSkillCase('divider-case'));
  await contactCommand(app, 'Show Simulate');
  await expect
    .poll(async () => {
      const model = await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.fleetModel());

      return model.bodies.some((body) => body.world?.length);
    })
    .toBe(true);

  return app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.fleetModel());
}

async function requestArm(app: App, payload: DraftInput, words: string, capture?: ArmCapture) {
  await contactCommand(app, 'Show Simulate');

  const field = app.page.locator(shown('[data-testid="teach-field"]'));

  await field.fill(words);
  await capture?.('prompt');
  await field.press('Enter');
  await expect
    .poll(() =>
      app.posts
        .filter((p) => p.route === 'acp-prompt')
        .map((p) => JSON.stringify(p.body))
        .join(' '),
    )
    .toContain(words);

  const draft = await app.page.evaluate(
    (request) => (window as unknown as { __studio: Studio }).__studio.agentRequest('skill_draft', request),
    { ...payload, request: words },
  );
  const id = /Draft ([a-f0-9]{64})/.exec(draft.text)?.[1];

  expect(id, draft.text).toBeTruthy();
  await app.page.evaluate(
    (draft) => (window as unknown as { __studio: Studio }).__studio.agentRequest('skill_train', { draft }),
    id,
  );
}

interface ObservedWindow {
  __studio: Studio;
  __armObservation?: { samples: number[][]; timer: ReturnType<typeof setInterval> };
}

async function beginObservation(app: App) {
  await app.page.evaluate(() => {
    const w = window as unknown as ObservedWindow;
    const samples: number[][] = [];
    const timer = setInterval(() => {
      const position = w.__studio.skillBodyPosition('link2');

      if (position) samples.push(position);
    }, 25);

    w.__armObservation = { samples, timer };
  });
}

async function observeReach(app: App, target: number[]) {
  await app.page
    .waitForFunction((point) => {
      const w = window as unknown as ObservedWindow;
      const position = w.__studio.skillBodyPosition('link2');
      const observation = w.__armObservation;

      if (!position || !observation) return false;

      const reached = Math.hypot(...position.map((v, i) => v - point[i])) < 0.005;

      if (!reached) return false;

      clearInterval(observation.timer);
      observation.samples.push(position);

      return true;
    }, target)
    .finally(() =>
      app.page.evaluate(() => {
        const observation = (window as unknown as ObservedWindow).__armObservation;

        if (observation) clearInterval(observation.timer);
      }),
    );

  return app.page.evaluate(() => (window as unknown as ObservedWindow).__armObservation!.samples);
}

export async function obstructedReachWalkthrough(app: App, capture?: ArmCapture) {
  const model = await loadArmScene(app);
  const mj = await loadMujoco();
  const request = armReachRequest(mj, model, { arm0: 60, arm1: 0, arm2: 0 });

  await requestArm(app, request, 'Reach around the divider to the other side', capture);
  await contactCommand(app, 'Show Simulate');
  await row(app).getByRole('button', { name: 'Try', exact: true }).waitFor();
  expect(await row(app).innerText()).toMatch(/32 tries/);
  await capture?.('ready');
  await beginObservation(app);
  await row(app).getByRole('button', { name: 'Try', exact: true }).click();

  const target = request.goal.kind === 'reach' ? request.goal.waypoints[0].point_mm.map((v) => v / 1000) : [];
  const samples = await observeReach(app, target);

  expect(Math.hypot(...samples.at(-1)!.map((v, i) => v - target[i]))).toBeLessThan(0.005);
  expect(samples.some((point) => Math.abs(point[1]) < 0.02 && point[2] < 0.185)).toBe(true);
  await capture?.('reached');
  expect(app.errors).toEqual([]);
}

export async function reopenArmSkill(app: App) {
  await contactCommand(app, 'Stop Simulation');
  await contactCommand(app, 'Rename Scene');
  await app.page.getByLabel('Scene name', { exact: true }).fill('Divider reach');
  await app.page.getByLabel('Scene name', { exact: true }).press('Enter');
  await app.page.waitForFunction(async () => {
    const scenes = (await (await fetch('/api/bridge/scenes')).json()) as { project?: { skills?: unknown[] } }[];

    return scenes.some((scene) => scene.project?.skills?.length);
  });
  await app.page.reload();
  await app.page.waitForFunction(() => Boolean((window as unknown as { __studio?: Studio }).__studio));
  await expect.poll(() => partCount(app.page)).toBe(4);
  await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.stageSkillCase('divider-case'));
  await contactCommand(app, 'Show Simulate');
  await row(app).getByRole('button', { name: 'Try', exact: true }).waitFor();
}

export async function refusedReachWalkthrough(app: App, capture?: ArmCapture) {
  const model = await loadArmScene(app);
  const mj = await loadMujoco();
  const request = { ...armReachRequest(mj, model, { arm0: 0, arm1: 0, arm2: 0 }), name: 'Blocked reach' };

  await requestArm(app, request, 'Reach into the divider');
  await app.page.waitForFunction(async () => {
    const result = await (window as unknown as { __studio: Studio }).__studio.agentRequest('skill_list', {});

    return /too little clearance|within the search budget/.test(result.text);
  });
  await capture?.('refused');
  expect(
    await app.page
      .locator(shown('[data-testid="skill-row"]'))
      .filter({ hasText: 'Reach into the divider' })
      .getByRole('button', { name: 'Try' })
      .count(),
  ).toBe(0);
  expect(app.errors).toEqual([]);
}
