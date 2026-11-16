import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SimModel } from '../src/sim/mjcfTypes';
import type { Skill } from '../src/skills/artifacts';
import type { SkillRecord } from '../src/skills/skillRecords';
import type { TwinVerdict } from '../src/fleet/twinArena';
import { fleetSkillFixture } from './fleetSkillFixture';
import { ARM } from './armFixture';
import { driveRecordableMotion } from './operateMotion';
import { FAKE_DAEMON_SCRIPT } from './fakeDaemon';
import { openApp, openPlayTab, partCount, shown, type App } from './harness';

let app: App;

const UNITS = ['arm-1', 'arm-2', 'arm-3'];
const WEAK = 'arm-3';
const SAGS = 'Shoulder sags';
let nextSkill: ReturnType<typeof fleetSkillFixture>;
let previousSkill: ReturnType<typeof fleetSkillFixture>;

interface FleetRow {
  unit: string;
  mode: string;
  run: string | null;
  faultLatched: boolean;
  version: string | null;
  previous: string | null;
}

type Studio = {
  attachRobot: (link: unknown) => void;
  load: (record: unknown) => void;
  connectUnit: (unit: string) => Promise<{ ok: boolean }>;
  fleet: () => { selected: string; units: FleetRow[] };
  fleetModel: () => Promise<SimModel>;
  simState: () => { drive: string };
  seedFleetSkill: (record: SkillRecord, skill?: Skill) => Promise<void>;
  stubFleetTwins: (twins: Record<string, TwinVerdict> | null) => void;
  rollOutState: () => { held: Record<string, string>; reached: string[]; stage: string } | null;
};

type FakeUnit = {
  intents: number[][];
  statuses: unknown[];
  plantStall: (id: number) => boolean;
  policy: Array<{ kind: string; hash?: string }>;
};

type FleetWindow = { __studio: Studio; __fakeRobotLink: { units: Record<string, FakeUnit> } };

const fleet = () => app.page.evaluate(() => (window as unknown as FleetWindow).__studio.fleet());

const row = (unit: string) => app.page.locator(shown(`[data-fleet-unit="${unit}"]`)).first();

const unitMode = async (unit: string) => (await fleet()).units.find((u) => u.unit === unit)?.mode;

async function climbToTest(unit: string) {
  await row(unit).click();
  await expect.poll(async () => (await fleet()).selected).toBe(unit);

  for (const rung of ['set_up', 'test']) {
    await app.page
      .locator(shown(`[data-robot-rung="${rung}"]`))
      .first()
      .click();
    await expect.poll(() => unitMode(unit)).toBe(rung);
  }
}

const policyOf = (unit: string) =>
  app.page.evaluate((u) => (window as unknown as FleetWindow).__fakeRobotLink.units[u].policy, unit);

async function recordFleetFault() {
  const { page } = app;

  await row(WEAK).click();
  await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();
  await page
    .locator(shown('button'), { hasText: /^Drive$/ })
    .first()
    .click();
  await expect.poll(() => page.evaluate(() => (window as unknown as FleetWindow).__studio.simState().drive)).toBe('on');
  await driveRecordableMotion(page, WEAK);
  await openPlayTab(page, 'Operate');
  await row('arm-1').click();
  await page.evaluate((u) => (window as unknown as FleetWindow).__fakeRobotLink.units[u].plantStall(2), WEAK);
}

async function inspectFleetFault() {
  const { page } = app;

  const continuing = () =>
    page.evaluate(() => (window as unknown as FleetWindow).__fakeRobotLink.units['arm-1'].intents.length);
  const sentBefore = await continuing();

  await expect.poll(continuing).toBeGreaterThan(sentBefore);
  await row(WEAK).getByRole('button', { name: 'Inspect Problems', exact: true }).click();

  const incidents = page.getByRole('dialog').filter({ has: page.locator('[data-incident]') });
  const incident = incidents.locator('[data-incident]').first();

  await expect.poll(() => incident.getAttribute('data-active')).toBe('true');
  await incidents.getByRole('button', { name: 'Acknowledge', exact: true }).first().click();
  expect(await incident.getAttribute('data-active')).toBe('true');
  expect(await incident.innerText()).toContain('Acknowledged');
  expect((await fleet()).units.find((u) => u.unit === WEAK)?.faultLatched).toBe(true);
  await expect.poll(() => incidents.getByRole('button', { name: 'Open Try', exact: true }).count()).toBe(1);
  await incidents.getByRole('button', { name: 'Open Try', exact: true }).click();
  await expect.poll(() => page.locator(shown('[data-testid="try-timeline"]')).count()).toBe(1);
  await page.locator(shown('[data-testid="try-timeline"]')).getByRole('button', { name: 'Close', exact: true }).click();
}

beforeAll(async () => {
  app = await openApp();
  await app.page.addScriptTag({ content: FAKE_DAEMON_SCRIPT });
  await app.page.evaluate(() => {
    const w = window as unknown as FleetWindow;

    w.__studio.attachRobot(w.__fakeRobotLink);
  });
  await app.page.evaluate((record) => (window as unknown as FleetWindow).__studio.load(record), ARM);
  await vi.waitFor(async () => expect(await partCount(app.page)).toBe(ARM.parts.length), { timeout: 10000 });

  const model = await app.page.evaluate(() => (window as unknown as FleetWindow).__studio.fleetModel());

  nextSkill = fleetSkillFixture(model);
  previousSkill = fleetSkillFixture(model, 'Previous reach');
  nextSkill.record.createdAt = '2026-11-13T00:00:00.000Z';
  previousSkill.record.createdAt = '2026-11-14T00:00:00.000Z';
  await app.page.evaluate(
    ({ record, skill }) => (window as unknown as FleetWindow).__studio.seedFleetSkill(record, skill),
    previousSkill,
  );
}, 120000);

afterAll(async () => {
  await app?.close();
});

describe('Operate a fleet of emulated arms', () => {
  it('keeps two arms in Test when one stalls, then rolls a skill out past the weak unit and rolls one back', async () => {
    const { page } = app;

    await openPlayTab(page, 'Operate');

    for (const unit of UNITS)
      expect(await page.evaluate((u) => (window as unknown as FleetWindow).__studio.connectUnit(u), unit)).toEqual({
        ok: true,
      });

    await expect.poll(() => page.locator(shown('[data-fleet-unit]')).count()).toBe(3);

    for (const unit of UNITS) await climbToTest(unit);

    await expect
      .poll(async () => (await fleet()).units.map((unit) => unit.version))
      .toEqual(UNITS.map(() => previousSkill.record.hash));
    await page.evaluate(
      ({ record, skill }) => (window as unknown as FleetWindow).__studio.seedFleetSkill(record, skill),
      nextSkill,
    );

    await recordFleetFault();
    await expect.poll(() => row(WEAK).getAttribute('data-fault')).toBe('true');

    const afterStall = (await fleet()).units;

    expect(afterStall.filter((u) => u.unit !== WEAK).map((u) => [u.unit, u.mode, u.run, u.faultLatched])).toEqual([
      ['arm-1', 'test', 'running', false],
      ['arm-2', 'test', 'running', false],
    ]);

    await inspectFleetFault();

    await page.evaluate((twins) => (window as unknown as FleetWindow).__studio.stubFleetTwins(twins), {
      'arm-1': { unit: 'arm-1', passes: 32, trials: 32, passed: true, line: '32 of 32 tries, at least 91%' },
      'arm-2': { unit: 'arm-2', passes: 31, trials: 32, passed: true, line: '31 of 32 tries, at least 86%' },
      [WEAK]: { unit: WEAK, passes: 4, trials: 32, passed: false, line: SAGS },
    });
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('Roll Out Reach');
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Roll Out Reach' });

    await expect.poll(() => dialog.count()).toBe(1);
    await dialog.getByRole('switch', { name: 'arm-1', exact: true }).click();
    expect(await dialog.getByRole('button', { name: 'Roll Out', exact: true }).isDisabled()).toBe(true);
    await dialog.getByRole('switch', { name: 'arm-2', exact: true }).click();
    await dialog.getByRole('button', { name: 'Roll Out', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as FleetWindow).__studio.rollOutState()))
      .toMatchObject({ stage: 'done', held: { [WEAK]: SAGS }, reached: ['arm-2', 'arm-1'] });
    await page.evaluate(() => (window as unknown as FleetWindow).__studio.stubFleetTwins(null));

    expect(await policyOf('arm-1')).toEqual([{ kind: 'skill', hash: nextSkill.record.hash }]);
    expect(await policyOf('arm-2')).toEqual([{ kind: 'skill', hash: nextSkill.record.hash }]);
    expect(await policyOf(WEAK)).not.toContainEqual({ kind: 'skill', hash: nextSkill.record.hash });
    expect((await fleet()).units.map((u) => [u.unit, u.version, u.mode])).toEqual([
      ['arm-1', nextSkill.record.hash, 'rehearse'],
      ['arm-2', nextSkill.record.hash, 'rehearse'],
      [WEAK, previousSkill.record.hash, 'test'],
    ]);
    await expect.poll(() => row(WEAK).getAttribute('data-held')).toBe(SAGS);
    await page.locator(shown('[role=tab]'), { hasText: 'Simulate' }).first().click();

    const ready = page.locator(shown(`[data-testid="skill-row"][data-skill="${nextSkill.record.hash}"]`)).first();

    await expect.poll(() => ready.locator('[data-twin-unit]').count()).toBe(3);
    expect(await ready.locator('[data-twin-unit="arm-2"]').innerText()).toContain('31 of 32');
    expect(await ready.locator(`[data-twin-unit="${WEAK}"]`).innerText()).toContain(SAGS);
    await ready.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Roll Out', exact: true }).click();
    await expect.poll(() => dialog.count()).toBe(1);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await openPlayTab(page, 'Operate');

    expect((await fleet()).units.find((unit) => unit.unit === 'arm-2')?.previous).toBe(previousSkill.record.hash);
    await row('arm-2').hover();
    await row('arm-2').locator('button', { hasText: 'Roll Back' }).click();
    await expect
      .poll(async () => (await fleet()).units.find((u) => u.unit === 'arm-2')?.version)
      .toBe(previousSkill.record.hash);
    expect(await policyOf('arm-2')).not.toContainEqual({ kind: 'skill', hash: nextSkill.record.hash });
    expect(await policyOf('arm-2')).toEqual([{ kind: 'skill', hash: previousSkill.record.hash }]);
    expect(app.errors).toEqual([]);
  });
});
