import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BAM_STS3215_7V4 } from '../src/data/servoFits';
import type { ServoCalibration } from '../src/reality/types';
import { box } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { SIM_MODEL_VERSION } from '../src/sim/mjcfTypes';
import { fixtureModel } from '../src/skills/fixtureModels';
import { kitJob } from '../src/skills/kitJob';
import { moveEnvironment } from '../src/skills/moveEnvironment';
import { clockPolicy, quadSit } from '../src/skills/moveFixtures';
import { DEFAULT_PROJECT, type PolicyRecord, type ProjectSettings, type ScenePart } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematicsRig';
import { openApp, partCount, type App } from './harness';
import { holdPolicy } from './holdPose';

let app: App;

type Studio = {
  load: (r: unknown) => void;
  simState: () => {
    fingerprints: Record<string, string>;
    controller: { kind: string; clock: unknown; trainedSteps: number | null };
  };
  calibrate: (jointId: string, calibration: ServoCalibration) => void;
  stubTrainer: (policy: unknown, snapshots?: unknown[]) => void;
  releaseTrainer: () => void;
};

const trainedSteps = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().controller.trainedSteps);

const releaseTrainer = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.releaseTrainer());

const fingerprints = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().fingerprints);

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const clickTab = (name: string) => app.page.locator(visible('[role=tab]'), { hasText: name }).first().click();

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

const composer = () => app.page.locator(visible('textarea')).last();

const slashMenu = () => app.page.locator('[data-testid="slash-menu"]');

const focusedValue = () =>
  app.page.evaluate(() => {
    const el = document.activeElement;

    return el instanceof HTMLTextAreaElement ? el.value : el?.tagName;
  });

async function loadFixture(id: string, policies: PolicyRecord[] = []) {
  const robot = fixtureRobots().find((r) => r.id === id)!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints, policies },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

beforeAll(async () => {
  app = await openApp({ 'train-status': { uv: true, ready: true, running: [] } });
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('slash commands', () => {
  it('opens on a slash, picks /train with the keyboard and keeps focus', async () => {
    await clickTab('Agent');
    await composer().click();
    await app.page.keyboard.type('/');
    await expect.poll(() => slashMenu().count()).toBe(1);

    const listed = await slashMenu().innerText();

    for (const name of ['/train', '/routine', '/case', '/simulate', '/check']) expect(listed).toContain(name);

    await app.page.keyboard.type('tr');
    await app.page.keyboard.press('Enter');
    await expect.poll(() => composer().inputValue()).toBe('/train ');
    await expect.poll(focusedValue).toBe('/train ');
    expect(await slashMenu().count()).toBe(0);
  });

  it('moves with the arrows, and Esc closes it without touching the text', async () => {
    await composer().fill('');
    await composer().click();
    await app.page.keyboard.type('/');
    await expect.poll(() => slashMenu().count()).toBe(1);
    await app.page.keyboard.press('ArrowDown');
    await app.page.keyboard.press('ArrowDown');
    await app.page.keyboard.press('Enter');
    await expect.poll(() => composer().inputValue()).toBe('/case ');

    await composer().fill('');
    await app.page.keyboard.type('/');
    await expect.poll(() => slashMenu().count()).toBe(1);
    await app.page.keyboard.press('Escape');
    await expect.poll(() => slashMenu().count()).toBe(0);
    expect(await composer().inputValue()).toBe('/');
    await composer().fill('');
  });

  it('puts a command in the composer from ⌘K', async () => {
    await app.page.keyboard.press('Meta+k');
    await expect.poll(() => app.page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT');
    await app.page.keyboard.type('Teach a Skill');
    await app.page.keyboard.press('Enter');
    await expect.poll(focusedValue).toBe('/train ');
    await composer().fill('');
    expect(app.errors).toEqual([]);
  });
});

describe('the Train section', () => {
  it('sends what the user types to the agent as /train, and lists the Motor Kit', async () => {
    await loadFixture('biped-servo');
    await clickTab('Simulate');

    const field = app.page.locator(visible('[data-testid="teach-field"]'));

    await expect.poll(() => field.count()).toBe(1);
    await expect.poll(() => app.page.locator(visible('[data-testid="skill-row"]')).count(), { timeout: 60000 }).toBe(4);
    expect(await app.page.locator(visible('[data-testid="skills-list"]')).innerText()).toContain('Get up');
    await field.fill('wave a front leg');
    await field.press('Enter');

    const prompt = () => app.posts.find((p) => p.route === 'acp-prompt')?.body as { promptText?: string } | undefined;

    await expect.poll(() => prompt()?.promptText ?? '').toContain('/train wave a front leg');
    await expect
      .poll(() => app.page.locator(visible('main, body')).first().innerText())
      .toContain('/train wave a front leg');
    expect(await button(/^Stand$|^Walk$/).count()).toBe(0);
    expect(app.errors).toEqual([]);
  });

  it('lists trained policies in Train, with Delete on right-click', async () => {
    const policy: PolicyRecord = {
      id: 'walk-e2e',
      name: 'Walk forward',
      task: 'walk',
      robot: 'robot',
      robotName: 'Biped',
      command: [0.2, 0, 0],
      trainedSteps: 2_000_000,
      createdAt: '2026-11-12T00:00:00.000Z',
    };

    await loadFixture('biped-servo', [policy]);
    await clickTab('Simulate');

    const train = app.page.locator(visible('section'), { has: app.page.locator('h3', { hasText: /^Train$/ }) });
    const row = train.getByTestId('policy-list').locator('li', { hasText: 'Walk forward' });

    await expect.poll(() => row.count()).toBe(1);
    expect(await row.innerText()).toContain('2.0M steps');
    expect(await app.page.locator(visible('h3'), { hasText: /^Policies$/ }).count()).toBe(0);
    await row.click({ button: 'right' });
    await expect.poll(() => app.page.getByRole('menuitem', { name: 'Delete' }).count()).toBe(1);
    await app.page.keyboard.press('Escape');
    expect(app.errors).toEqual([]);
  });
});

const servoQuad = () => {
  const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;
  const hip = robot.joints.find((j) => j.id === 'leg0_abduct')!;
  const servo: ScenePart = {
    ...box('leg0_servo', hip.origin, [24, 32, 45], 55),
    componentId: 'feetech-sts3215',
    componentVariant: 'c001',
  };
  const joints = robot.joints.map((j) =>
    j === hip ? { ...j, parent: [...j.parent, servo.id], actuators: [servo.id] } : j,
  );
  const parts = [...robot.parts, servo];

  return { name: 'quad', parts, project: { ...DEFAULT_PROJECT, joints } as ProjectSettings };
};

const calibration = (): ServoCalibration => ({
  verdict: 'measured',
  family: 'sts3215',
  version: 0,
  rung: 'response',
  fit: { ...BAM_STS3215_7V4, kt: BAM_STS3215_7V4.kt * 0.8 },
  volts: 7.4,
  scales: { kt: 0.8 },
  conditions: { volts: 7.4, temperatureC: 30 },
  evidence: { logs: 3, presetErrorRad: 0.04, fittedErrorRad: 0.01, gain: 0.75, explained: 0.9, reason: '' },
});

const loadScene = async (record: ReturnType<typeof servoQuad>) => {
  await app.page.evaluate((r) => (window as unknown as { __studio: Studio }).__studio.load(r), record);
  await expect.poll(() => partCount(app.page)).toBe(record.parts.length);
};

describe('a policy trained before a calibration', () => {
  it('shows Out of date once a joint is calibrated, and Retrain starts the same job', async () => {
    const scene = servoQuad();
    const key = buildRig(scene.project.joints!, scene.parts).robots[0].key;

    await loadScene(scene);
    await expect.poll(async () => (await fingerprints())[key] ?? '', { timeout: 60000 }).not.toBe('');

    const policy: PolicyRecord = {
      id: 'walk-before-calibration',
      name: 'Walk 1',
      task: 'walk',
      robot: key,
      robotName: 'quad',
      command: [0.3, 0, 0],
      trainedSteps: 2_000_000,
      minutes: 5,
      modelVersion: SIM_MODEL_VERSION,
      fingerprint: (await fingerprints())[key],
      createdAt: '2026-11-01T00:00:00.000Z',
    };

    await loadScene({ ...scene, project: { ...scene.project, policies: [policy] } });
    await clickTab('Simulate');

    const row = app.page.locator(visible(`[data-policy="${policy.id}"]`)).first();

    await expect.poll(() => row.getAttribute('data-stale'), { timeout: 60000 }).toBe('false');
    await app.page.evaluate(
      (c) => (window as unknown as { __studio: Studio }).__studio.calibrate('leg0_abduct', c),
      calibration(),
    );
    await expect.poll(() => row.getAttribute('data-stale'), { timeout: 60000 }).toBe('true');
    expect(await row.innerText()).toContain('Out of date');

    await row.click({ button: 'right' });
    await app.page.getByRole('menuitem', { name: 'Retrain' }).click();

    const started = () =>
      app.posts
        .map((p) => (p.route === 'train-start' ? (p.body as { job: Record<string, unknown> }).job : null))
        .find((job) => job?.name === policy.name);

    await expect.poll(() => started() ?? null, { timeout: 60000 }).not.toBeNull();
    expect(started()).toMatchObject({ task: 'walk', minutes: 5, command: [0.3, 0, 0], robotKey: key });
    expect(started()?.fingerprint).toBe((await fingerprints())[key]);
    expect(started()?.fingerprint).not.toBe(policy.fingerprint);
    await expect.poll(() => row.getAttribute('data-retraining')).toBe('true');
    expect(app.errors).toEqual([]);
  }, 180000);
});

describe('a move from a Pose-tab animation', () => {
  it('lists Sit in the Train section, trains it to a passing run, and Try plays it in the live sim', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;
    const sit = quadSit();
    const environment = moveEnvironment(fixtureModel('quad-servo'), sit);

    await loadScene({
      name: 'quad',
      parts: robot.parts,
      project: { ...DEFAULT_PROJECT, joints: robot.joints, animations: [sit] },
    });
    await clickTab('Simulate');

    const row = app.page.locator(visible('[data-testid="skill-row"]'), { hasText: 'Sit' }).first();

    await expect.poll(() => row.count(), { timeout: 60000 }).toBe(1);
    await app.page.evaluate(
      (policy) => (window as unknown as { __studio: Studio }).__studio.stubTrainer(policy),
      clockPolicy(environment),
    );
    await app.page.route(
      (url) => url.pathname === '/api/bridge/skill',
      (route) => {
        const saved = app.posts.filter((p) => p.route === 'skill-save').at(-1)?.body as { text?: string } | undefined;

        return route.fulfill({ status: 200, contentType: 'application/json', body: saved?.text ?? '{}' });
      },
    );
    await row.locator('button', { hasText: 'Train' }).click();
    await expect.poll(() => row.innerText(), { timeout: 150000 }).toContain('of 32 tries');
    await row.locator('button', { hasText: 'Try' }).click();
    await expect
      .poll(() => app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState().controller))
      .toMatchObject({ kind: 'policy', clock: { frames: 51, loop: false } });
    expect(app.errors).toEqual([]);
  }, 240000);
});

describe('watching Stand learn', () => {
  it('plays each snapshot on the canvas while it trains, then keeps them on the row', async () => {
    const robot = fixtureRobots().find((r) => r.id === 'quad-servo')!;
    const job = kitJob(fixtureModel('quad-servo'), 'stand', { minutes: 1, seed: 0 });
    const [first, second, final] = [100, 200, 300].map((steps) => holdPolicy(job, steps));

    await loadScene({ name: 'quad', parts: robot.parts, project: { ...DEFAULT_PROJECT, joints: robot.joints } });
    await clickTab('Simulate');

    const row = app.page.locator(visible('[data-testid="skill-row"]'), { hasText: 'Stand' }).first();
    const steps = trainedSteps;

    await expect.poll(() => row.count(), { timeout: 60000 }).toBe(1);
    await app.page.evaluate(
      ({ policy, snapshots }) => (window as unknown as { __studio: Studio }).__studio.stubTrainer(policy, snapshots),
      { policy: final, snapshots: [first, second] },
    );
    await row.locator('button', { hasText: 'Train' }).click();
    await expect.poll(steps, { timeout: 60000 }).toBe(100);
    await expect.poll(() => row.getByTestId('watch-margin').count(), { timeout: 60000 }).toBe(1);
    await releaseTrainer();
    await expect.poll(steps, { timeout: 60000 }).toBe(200);
    await releaseTrainer();
    await expect.poll(() => row.innerText(), { timeout: 150000 }).toContain('of 32 tries');

    const snapshots = row.getByTestId('snapshot');

    await expect.poll(() => snapshots.count()).toBe(2);
    expect(await snapshots.allInnerTexts()).toEqual(['50', '100']);
    await snapshots.first().click();
    await expect.poll(steps, { timeout: 60000 }).toBe(100);
    expect(app.errors).toEqual([]);
  }, 240000);
});
