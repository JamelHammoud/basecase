import { parquetReadObjects } from 'hyparquet';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildCase, builderRobot } from '../src/cases/caseBuilder';
import type { ReferenceCommand } from '../src/cases/schema';
import type { DriveCommand } from '../src/sim/driveTypes';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';
import { startFakeHub, type FakeHub } from './fakeHub';
import { openApp, openPlayTab, partCount, type App } from './harness';

const HUB_TOKEN = 'hf_e2eFakeHubToken';

let app: App;
let hub: FakeHub;

interface SimState {
  status: string;
  drive: string;
  driveClass: string | null;
  offer: string;
  stats: { time: number; robots: Array<{ forward: number; travelled: number; fellAt: number | null }> } | null;
  world: string[];
  bodies: Array<{ parts: string[]; world: string[] }>;
  activeCase: string | null;
  tries: Array<{ passed: boolean; margin: number }>;
  effector: number[] | null;
}

type Studio = {
  simState: () => SimState;
  load: (r: unknown) => void;
  passTries: () => void;
  drive: (c: DriveCommand) => void;
  worldAt: () => Record<string, number[]>;
};

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState() as SimState);

async function loadFixture(id: string) {
  const robot = fixtureRobots().find((r) => r.id === id)!;

  await app.page.evaluate((record) => (window as unknown as { __studio: Studio }).__studio.load(record), {
    name: id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints },
  });
  await expect.poll(() => partCount(app.page)).toBe(robot.parts.length);
}

const clickTab = (name: string) => app.page.locator(visible('[role=tab]'), { hasText: name }).first().click();

const button = (name: string | RegExp) => app.page.locator(visible('button'), { hasText: name }).first();

const simHeadings = () =>
  app.page
    .getByTestId('case-brief')
    .locator('xpath=ancestor::section/..')
    .locator(':scope > section > header h3')
    .allInnerTexts();

async function startDriving(id: string) {
  await loadFixture(id);
  await clickTab('Simulate');
  await button(/^Drive$/).click();
  await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
  await expect.poll(() => app.page.getByTestId('drive-banner').count()).toBeGreaterThan(0);
}

async function holdKey(key: string, ms: number) {
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.down(key);
  await app.page.waitForTimeout(ms);
  await app.page.keyboard.up(key);
}

async function holdKeyUntilForward(key: string, metres: number) {
  await app.page.mouse.click(720, 450);
  await app.page.keyboard.down(key);
  await expect
    .poll(async () => (await simState()).stats?.robots[0].forward ?? 0, { timeout: 30000 })
    .toBeGreaterThan(metres);
  await app.page.keyboard.up(key);
}

async function datasetFiles() {
  const files = await app.page.evaluate(() =>
    (
      window as unknown as { __studio: { datasetFiles: () => Promise<Record<string, string> | null> } }
    ).__studio.datasetFiles(),
  );

  return Object.fromEntries(Object.entries(files ?? {}).map(([path, b64]) => [path, Buffer.from(b64, 'base64')]));
}

async function expectDataset() {
  const files = await datasetFiles();
  const paths = Object.keys(files);
  const at = (end: string) => files[paths.find((p) => p.endsWith(end))!];
  const rows = await parquetReadObjects({ file: new Uint8Array(at('data/chunk-000/episode_000000.parquet')).buffer });
  const info = JSON.parse(at('meta/info.json').toString());
  const videos = paths.filter((p) => p.endsWith('.mp4'));

  expect(paths.some((p) => p.endsWith('meta/modality.json'))).toBe(true);
  expect(info.total_frames).toBe(rows.length);
  expect(rows[0]['observation.state']).toHaveLength(3);
  expect(videos.map((p) => p.split('/').at(-2))).toEqual(['observation.images.scene']);

  for (const path of videos) {
    const input = new Input({ source: new BufferSource(new Uint8Array(files[path])), formats: ALL_FORMATS });
    const track = (await input.getPrimaryVideoTrack())!;
    const stats = await track.computePacketStats();

    expect([track.displayWidth, track.displayHeight]).toEqual([640, 480]);
    expect(stats.packetCount).toBe(rows.length);
    expect(info.features['observation.images.scene'].info['video.codec']).toMatch(/h264|vp9|av1/);
  }
}

async function stopDriving() {
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await simState()).drive).toBe('off');
}

beforeAll(async () => {
  hub = await startFakeHub({ token: HUB_TOKEN, port: inject('hubPort') });
  app = await openApp({}, ['hub-']);
}, 120000);

afterAll(async () => {
  await app?.close();
  await hub?.close();
});

const itUnlessWindows = it.skipIf(process.platform === 'win32');

describe('live drive', () => {
  it('drives a rover forward with W, and S, F and Backspace never edit parts', async () => {
    await startDriving('rover-diff');

    const before = await partCount(app.page);

    await holdKey('w', 2500);
    await expect.poll(async () => (await simState()).stats?.robots[0].forward ?? 0).toBeGreaterThan(0.1);

    for (const key of ['s', 'f', 'Backspace', 'Meta+z']) await app.page.keyboard.press(key);

    const after = await simState();

    expect(await partCount(app.page)).toBe(before);
    expect(after.status).toBe('ready');
    expect(after.drive).toBe('on');
    await stopDriving();
  });

  it('drives an arm with W', async () => {
    await startDriving('arm-6dof');
    expect((await simState()).driveClass).toBe('arm');
    await holdKey('w', 800);
    await expect.poll(async () => (await simState()).stats?.time ?? 0).toBeGreaterThan(1);
    expect((await simState()).stats?.robots[0].fellAt ?? null).toBeNull();
    await stopDriving();
  });

  it('walks a hexapod after its fall check, and offers to teach a biped to walk instead of Drive', async () => {
    await startDriving('hexapod');
    await holdKeyUntilForward('w', 0.1);
    await stopDriving();

    await loadFixture('biped-servo');
    await clickTab('Simulate');
    await expect.poll(() => button(/^Teach It to Move$/).count()).toBe(1);
    expect(await button(/^Drive$/).count()).toBe(0);
    expect((await simState()).offer).toBe('teach');
    expect(await app.page.locator(visible('body')).innerText()).not.toMatch(/Drive needs|Two-legged/);
  });

  itUnlessWindows('asks for the canvas while a text field has focus', async () => {
    await startDriving('rover-diff');
    await app.page.evaluate(() => {
      const field = document.createElement('textarea');

      field.id = 'drive-test-field';
      document.body.append(field);
      field.focus();
    });
    await expect
      .poll(() => app.page.getByTestId('drive-banner').filter({ hasText: 'Click the canvas to drive' }).count())
      .toBe(1);
    await app.page.evaluate(() => document.getElementById('drive-test-field')?.remove());
    await stopDriving();
    expect(app.errors).toEqual([]);
  });
});

function pickTimeline(): ReferenceCommand[] {
  const arm = fixtureRobots().find((r) => r.id === 'arm-6dof')!;
  const built = buildCase({ goal: 'pick', world: 'floor' }, builderRobot(buildRig(arm.joints, arm.parts), arm.parts));

  if (!built.ok) throw new Error(built.problem);

  return built.kase.reference.timeline;
}

const simTime = async () => (await simState()).stats?.time ?? 0;

const blockHeight = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.worldAt().block[1]);

const sendDrive = (c: ReferenceCommand) =>
  app.page.evaluate((command) => (window as unknown as { __studio: Studio }).__studio.drive(command), {
    ...c,
    v: [0, 0, 0],
  } as DriveCommand);

async function handAt(c: ReferenceCommand) {
  await sendDrive(c);
  await expect
    .poll(
      async () => {
        const hand = (await simState()).effector ?? [Infinity, 0, 0];

        return Math.hypot(...hand.map((x, i) => x - c.target![i]));
      },
      { timeout: 30000 },
    )
    .toBeLessThan(25);
}

async function waitSim(seconds: number) {
  const from = await simTime();

  await expect.poll(simTime, { timeout: 30000 }).toBeGreaterThan(from + seconds);
}

async function openTouchTheDots() {
  await loadFixture('arm-3dof');
  await openPlayTab(app.page, 'Cases');
  await button('New Case').click();

  const card = app.page.locator(visible('[data-testid="new-case"]'));
  const dots = card.getByLabel('Dots');

  await dots.fill('3');
  await dots.press('Enter');
  await expect
    .poll(() => card.getByTestId('new-case-brief').innerText())
    .toBe('Touch each dot in order with the end effector.');
  expect(await card.getByLabel('Distance').count()).toBe(0);
  await card.locator('button', { hasText: 'Create' }).click();
  await expect.poll(async () => (await simState()).activeCase).toBe('touch-the-dots');
}

async function expectPublished(repo: string) {
  const published = hub.repos.get(repo)!;
  const paths = [...published.files.keys()];
  const parquet = published.files.get('data/chunk-000/episode_000000.parquet')!;
  const rows = await parquetReadObjects({ file: new Uint8Array(parquet).buffer });
  const info = JSON.parse(published.files.get('meta/info.json')!.toString());

  expect(published.kind).toBe('dataset');
  expect(paths).toEqual(expect.arrayContaining(['meta/info.json', 'meta/modality.json', 'meta/episodes.jsonl']));
  expect(paths.filter((p) => p.endsWith('.mp4'))).toEqual([
    'videos/chunk-000/observation.images.scene/episode_000000.mp4',
  ]);
  expect(info.total_frames).toBe(rows.length);
  await expect.poll(() => published.tags.get('v2.1')).toBe(published.commits.length);
  expect(hub.requests.filter((r) => r.method === 'PUT').every((r) => r.auth === undefined)).toBe(true);
}

describe('Cases', () => {
  itUnlessWindows(
    'starts Touch the Dots on an arm, keeps the dots out of parts, records a try and exports it',
    async () => {
      await openTouchTheDots();
      await expect.poll(() => app.page.getByTestId('case-brief').count()).toBe(1);
      expect(await app.page.getByTestId('case-brief').innerText()).not.toContain('simulation only');
      expect((await simHeadings())[0]).toBe('Touch the Dots');

      const partsBefore = await partCount(app.page);

      await button('Try It').click();
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');

      const state = await simState();

      expect(state.world).toHaveLength(3);
      expect(state.bodies.flatMap((b) => b.parts)).not.toContain('dot0');
      expect(state.bodies.flatMap((b) => b.world)).toContain('dot0');
      expect(await partCount(app.page)).toBe(partsBefore);

      const clashes = await app.page.evaluate(async () =>
        JSON.stringify(
          await (window as unknown as { __studio: { interference: () => Promise<unknown> } }).__studio.interference(),
        ),
      );

      expect(clashes).not.toContain('dot0');

      await button('End Try').click();
      await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
      expect((await simState()).tries[0].passed).toBe(false);
      await expect.poll(() => app.page.getByTestId('try-row').count()).toBe(1);
      await expectDataset();

      const headings = await simHeadings();

      expect(headings.filter((h) => ['Try', 'Control', 'Train', 'Results'].includes(h))).toEqual(
        headings.includes('Train') ? ['Try', 'Control', 'Train', 'Results'] : ['Try', 'Control', 'Results'],
      );
      expect(headings.indexOf('Try')).toBe(1);
      expect(
        headings.filter((h) => ['Brief', 'Robot fit', 'Result', 'Model', 'Emulated robot', 'Policies'].includes(h)),
      ).toEqual([]);

      await button('Check Fit').click();
      await expect.poll(() => app.page.getByTestId('robot-fit').innerText(), { timeout: 60000 }).toContain('Compiles');
      expect(app.errors).toEqual([]);
    },
  );

  itUnlessWindows(
    'publishes a passed try to Hugging Face after signing in from Settings',
    async () => {
      const publish = () => button('Publish to Hugging Face');
      const commitsOf = (name: string) => hub.repos.get(name)?.commits.length ?? 0;
      const ours = () => [...hub.repos.keys()].filter((name) => /^tester\/touch-the-dots-[0-9a-f]{6}$/.test(name));
      const before = new Map(ours().map((name) => [name, commitsOf(name)]));
      const published = () => ours().filter((name) => commitsOf(name) > (before.get(name) ?? 0));

      await openTouchTheDots();
      await button('Try It').click();
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
      await button('End Try').click();
      await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.passTries());
      await expect.poll(() => publish().count()).toBe(1);

      await publish().click();

      const token = app.page.locator(visible('input[aria-label="Access token"]'));
      const signedOut = await token.waitFor({ timeout: 10000 }).then(
        () => true,
        () => false,
      );

      if (signedOut) {
        await token.fill(HUB_TOKEN);
        await token.press('Enter');
        await expect
          .poll(() => app.page.locator(visible('[role=dialog][aria-label=Settings]')).innerText())
          .toContain('tester');
        await app.page.keyboard.press('Escape');
        await publish().dblclick();
      }

      await expect.poll(() => published().length, { timeout: 120000 }).toBe(1);

      const [repo] = published();

      await expect.poll(() => commitsOf(repo), { timeout: 120000 }).toBe((before.get(repo) ?? 0) + 1);
      await expectPublished(repo);
      await expect.poll(() => app.page.getByRole('status').filter({ hasText: repo }).count()).toBeGreaterThan(0);
      expect(JSON.stringify(await app.page.evaluate(() => localStorage))).not.toContain(HUB_TOKEN);
      expect(JSON.stringify(app.posts)).not.toContain(HUB_TOKEN);
      expect(app.errors).toEqual([]);
    },
    180000,
  );

  itUnlessWindows('makes a Case with New Case, the only way to start one besides the agent, and opens it', async () => {
    await loadFixture('rover-diff');
    await openPlayTab(app.page, 'Cases');

    const panel = app.page.locator(visible('[data-testid="cases-panel"]'));

    await expect.poll(() => button('New Case').count()).toBe(1);
    expect(await panel.innerText()).not.toMatch(/Examples|Touch the Dots|Reach the Flag/);

    await button('New Case').click();

    const card = app.page.locator(visible('[data-testid="new-case"]'));

    await card.locator('[role=radio]', { hasText: 'Push a Box' }).click();
    await card.locator('[role=radio]', { hasText: 'Corridor' }).click();
    expect(await card.getByTestId('new-case-brief').innerText()).toBe('Push the box 500 mm onto the spot.');
    await card.locator('button', { hasText: 'Create' }).click();

    await expect.poll(async () => (await simState()).activeCase).toBe('push-a-box-in-a-corridor');
    await expect.poll(async () => (await simHeadings())[0]).toBe('Push a Box in a Corridor');
    expect((await simState()).world).toEqual(['box', 'goal', 'wall-left', 'wall-right']);
    expect(await panel.innerText()).toContain('In this scene');

    await button('Ask the Agent').click();
    await expect.poll(() => app.page.locator(visible('textarea')).last().inputValue()).toBe('/case ');
    await expect
      .poll(() =>
        app.page.evaluate(() => {
          const el = document.activeElement;

          return el instanceof HTMLTextAreaElement ? el.value : el?.tagName;
        }),
      )
      .toBe('/case ');
    expect(app.errors).toEqual([]);
  });
});

describe('a gripper', () => {
  it('makes Pick Up a Block with New Case, carries the block with Space closing the gripper, and passes', async () => {
    await loadFixture('arm-6dof');
    await openPlayTab(app.page, 'Cases');
    await button('New Case').click();

    const card = app.page.locator(visible('[data-testid="new-case"]'));

    await card.locator('[role=radio]', { hasText: 'Pick Up a Block' }).click();
    await card.locator('label', { hasText: 'Time' }).locator('input').fill('40');
    await card.locator('label', { hasText: 'Time' }).locator('input').press('Tab');
    await card.locator('button', { hasText: 'Create' }).click();
    await expect.poll(async () => (await simState()).activeCase).toBe('pick-up-a-block');
    await button('Try It').click();
    await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
    expect((await simState()).world).toEqual(['block', 'spot']);

    const resting = await blockHeight();
    const [above, down, , lift, carry, lower, , away] = pickTimeline();

    await app.page.mouse.click(720, 450);
    await handAt(above);
    await handAt(down);
    await app.page.keyboard.down(' ');
    await waitSim(1);
    await sendDrive(lift);
    await expect.poll(blockHeight, { timeout: 30000 }).toBeGreaterThan(resting + 30);
    await handAt(carry);
    await handAt(lower);
    await app.page.keyboard.up(' ');
    await waitSim(1);
    await handAt(away);
    await button('End Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
    expect((await simState()).tries[0].passed).toBe(true);
    expect(app.errors).toEqual([]);
  }, 180000);
});
