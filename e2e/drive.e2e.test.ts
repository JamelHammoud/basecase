import { parquetReadObjects } from 'hyparquet';
import { plural } from '../electron/plural.mjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ReferenceCommand } from '../src/cases/schema';
import type { DriveCommand } from '../src/sim/driveTypes';
import { withLidar, type FixtureRobot } from '../src/sim/fixtures/parts';
import { fixtureRobots } from '../src/sim/fixtures/robots';
import type { SimState, Studio } from './driveStudio';
import {
  datasetFiles,
  endTryAt,
  expectCaseCheckOpensRow,
  expectDataset,
  expectGenerated,
  inDataset,
  loadFixtureRobot,
  passedDatasetFiles,
  pickTimeline,
} from './driveChecks';
import { expectRealTry } from './driveMat';
import { openApp, openPlayTab, partCount, type App } from './harness';

let app: App;

const visible = (selector: string) => `${selector}:not([inert] *):visible`;

const simState = () =>
  app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.simState() as SimState);

const loadFixture = (id: string | FixtureRobot) => loadFixtureRobot(app.page, id);

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

async function stopDriving() {
  await app.page.keyboard.press('Escape');
  await expect.poll(async () => (await simState()).drive).toBe('off');
}

beforeAll(async () => {
  app = await openApp();
}, 120000);

afterAll(async () => {
  await app?.close();
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

  it('offers to teach a biped to walk instead of Drive', async () => {
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
  await card.locator('button', { hasText: 'Make Case' }).click();
  await expect.poll(async () => (await simState()).activeCase).toBe('touch-the-dots');
}

const SHORT_TRY_SECONDS = 0.4;

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

      await endTryAt(app.page, SHORT_TRY_SECONDS);
      await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
      expect((await simState()).tries[0].passed).toBe(false);

      const clashes = await app.page.evaluate(async () =>
        JSON.stringify(
          await (window as unknown as { __studio: { interference: () => Promise<unknown> } }).__studio.interference(),
        ),
      );

      expect(clashes).not.toContain('dot0');
      await expect.poll(() => app.page.getByTestId('try-row').count()).toBe(1);
      await expectDataset(await passedDatasetFiles(app.page));

      const headings = await simHeadings();

      expect(headings.filter((h) => ['Try', 'Control', 'Train', 'Results'].includes(h))).toEqual(
        headings.includes('Train') ? ['Try', 'Control', 'Train', 'Results'] : ['Try', 'Control', 'Results'],
      );
      expect(headings.indexOf('Try')).toBe(1);
      expect(
        headings.filter((h) => ['Brief', 'Robot fit', 'Result', 'Model', 'Emulated robot', 'Policies'].includes(h)),
      ).toEqual([]);

      await expectCaseCheckOpensRow(app.page, 'Touch the Dots');
      expect(app.errors).toEqual([]);
    },
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
    await card.locator('button', { hasText: 'Make Case' }).click();

    await expect.poll(async () => (await simState()).activeCase).toBe('push-a-box-in-a-corridor');
    await expect.poll(async () => (await simHeadings())[0]).toBe('Push a Box in a Corridor');
    expect((await simState()).world).toEqual(['box', 'goal', 'wall-left', 'wall-right']);
    expect(await panel.innerText()).toContain('Push a Box in a Corridor');

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

describe('terrain', () => {
  itUnlessWindows(
    'makes Walk Without Falling on Rough Ground on the quadruped, and its reference try runs',
    async () => {
      await loadFixture('quad-servo');
      await openPlayTab(app.page, 'Cases');
      await button('New Case').click();

      const card = app.page.locator(visible('[data-testid="new-case"]'));

      await card.locator('[role=radio]', { hasText: 'Walk Without Falling' }).click();
      await card.locator('[role=radio]', { hasText: 'Rough Ground' }).click();
      expect(await card.getByLabel('Height').inputValue()).toBe('14');

      const time = card.getByLabel('Time');

      await time.fill('4');
      await time.press('Enter');
      await card.locator('button', { hasText: 'Make Case' }).click();

      await expect.poll(async () => (await simState()).activeCase).toBe('walk-without-falling-on-rough-ground');

      const { world } = await simState();

      expect(world.length).toBeGreaterThan(20);
      expect(world.every((id) => id.startsWith('tile-'))).toBe(true);

      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.referenceTry());
      await expect.poll(async () => (await simState()).tries.length, { timeout: 60000 }).toBe(1);
      expect(app.errors).toEqual([]);
    },
  );
});

describe('a real robot', () => {
  itUnlessWindows(
    'exports a Case mat and records a passing try on the real robot from the camera',
    async () => {
      await loadFixture('rover-diff');
      await openPlayTab(app.page, 'Cases');
      await expectRealTry(app.page);
      expect(app.errors).toEqual([]);
    },
    120000,
  );
});

describe('Multiply', () => {
  itUnlessWindows(
    'multiplies a passed try from ⌘K into generated tries under its row, and exports them with their seeds',
    async () => {
      await openTouchTheDots();
      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.referenceTry());
      await expect.poll(async () => (await simState()).tries.length, { timeout: 60000 }).toBe(1);
      expect((await simState()).tries[0].passed).toBe(true);

      await app.page.evaluate(() => (window as unknown as { __studio: Studio }).__studio.multiplyRuns(5));
      await app.page.keyboard.press('Meta+k');
      await app.page.getByLabel('Search commands').fill('Multiply');
      await expect.poll(() => app.page.getByText(/^Multiply$/).count(), { timeout: 15000 }).toBe(1);
      await app.page.keyboard.press('Enter');

      const done = app.page.getByRole('status').filter({ hasText: /^Kept \d+ of 5\b/ });

      await done.first().waitFor({ timeout: 120000 });

      const kept = Number(/Kept (\d+)/.exec(await done.first().innerText())![1]);
      const rows = app.page.locator(visible('[data-testid="try-row"]'));

      expect(kept).toBeGreaterThan(0);
      await expect.poll(async () => (await simState()).tries.filter((t) => t.generated).length).toBe(kept);
      expect((await simState()).multiplying).toBe(false);
      expect((await simState()).tries.every((t) => t.passed)).toBe(true);
      expect(await rows.count()).toBe(1);
      expect(await rows.first().getByTestId('try-generated').innerText()).toBe(plural(kept, 'variation'));

      expectGenerated(await datasetFiles(app.page), kept);
      expect(app.errors).toEqual([]);
    },
    180000,
  );
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
    await card.locator('button', { hasText: 'Make Case' }).click();
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
    await button('Stop Try').click();
    await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);
    expect((await simState()).tries[0].passed).toBe(true);
    expect(app.errors).toEqual([]);
  }, 180000);
});

describe('LiDAR', () => {
  itUnlessWindows(
    'scans a corridor with a rover’s LiDAR, draws the hits and exports them as observation.scan',
    async () => {
      await loadFixture(
        withLidar(
          fixtureRobots().find((r) => r.id === 'rover-diff')!,
          'slamtec-rplidar-s2',
        ),
      );
      await openPlayTab(app.page, 'Cases');
      await button('New Case').click();

      const card = app.page.locator(visible('[data-testid="new-case"]'));

      await card.locator('[role=radio]', { hasText: 'Reach a Spot' }).click();
      await card.locator('[role=radio]', { hasText: 'Corridor' }).click();
      await card.locator('button', { hasText: 'Make Case' }).click();
      await expect.poll(async () => (await simState()).activeCase).toBe('reach-a-spot-in-a-corridor');

      await button('Try It').click();
      await expect.poll(async () => (await simState()).drive, { timeout: 60000 }).toBe('on');
      await expect.poll(async () => (await simState()).scanPoints, { timeout: 30000 }).toBeGreaterThan(0);
      await endTryAt(app.page, SHORT_TRY_SECONDS);
      await expect.poll(async () => (await simState()).tries.length, { timeout: 30000 }).toBe(1);

      const files = inDataset(await passedDatasetFiles(app.page));
      const rows = await parquetReadObjects({
        file: new Uint8Array(files['data/chunk-000/file-000.parquet']).buffer,
      });
      const info = JSON.parse(files['meta/info.json'].toString());

      expect(info.features['observation.scan'].shape).toEqual([720]);
      expect(rows[0]['observation.scan']).toHaveLength(720);
      expect(JSON.parse(files['v2.1/meta/modality.json'].toString()).state.scan.original_key).toBe('observation.scan');
      expect(app.errors).toEqual([]);
    },
  );
});
