import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSettings, RobotJoint, ScenePart } from '../src/types/robotics';
import { shapeKey } from '../src/print/shapeKey';
import { component, sceneOf } from '../src/wiring/fixtures';
import type { Net } from '../src/wiring/netlist';
import { buildCheckPage, studioLoad } from './buildCheckFixtures';
import { openApp, shown, type App } from './harness';

interface BuildAlongStudio {
  load: (record: { name: string; parts: unknown[]; project: unknown }) => void;
  sceneRecord: () => { project: ProjectSettings };
  parts: () => Array<{ id: string; visible: boolean }>;
  shownParts: () => string[];
  buildAlongSteps: () => Array<{
    shown: string[];
    servos: Array<{ partId: string; joint: string; id: number }>;
    routes: Net[];
  }>;
  buildAlongRoutes: () => Net[];
  selection: () => string[];
}

let app: App;

const part = (id: string, y: number, height: number, extra: Partial<ScenePart> = {}): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [0, y + height / 2, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height, depth: 40 },
  color: '#d8d8d8',
  note: '',
  visible: true,
  locked: false,
  ...extra,
});

const servo = (id: string, y: number) =>
  part(id, y, 40, {
    name: 'Feetech STS3215',
    kind: 'component',
    category: 'actuators',
    componentId: 'feetech-sts3215',
    componentVariant: 'c001',
    color: '#222222',
  });

const parts = [
  part('base', 0, 20, { name: 'Base', dimensions: { width: 80, height: 20, depth: 80 } }),
  servo('pan-servo', 20),
  part('upper-arm', 60, 60, { name: 'Upper Arm' }),
  servo('lift-servo', 120),
  part('forearm', 160, 60, { name: 'Forearm' }),
  part('cutout', 180, 10, { name: 'Cable Hole', role: 'cutout' }),
];

const joint = (id: string, name: string, extra: Partial<RobotJoint>): RobotJoint => ({
  id,
  name,
  type: 'revolute',
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [0, 1, 0],
  limb: 'arm',
  ...extra,
});

const joints: RobotJoint[] = [
  joint('mount', 'Mount', { type: 'fixed', parent: ['base'], child: ['pan-servo'] }),
  joint('pan', 'Shoulder pan', { parent: ['base'], child: ['upper-arm'], actuators: ['pan-servo'] }),
  joint('lift', 'Shoulder lift', { parent: ['upper-arm'], child: ['forearm'], actuators: ['lift-servo'] }),
];

const sceneParts = () =>
  app.page.evaluate(() => (window as unknown as { __studio: BuildAlongStudio }).__studio.parts());

const shownParts = () =>
  app.page.evaluate(() => (window as unknown as { __studio: BuildAlongStudio }).__studio.shownParts().sort());

const planSteps = () =>
  app.page.evaluate(() => (window as unknown as { __studio: BuildAlongStudio }).__studio.buildAlongSteps());

const toolbar = () => app.page.locator(shown('[role=toolbar][aria-label="Build Along"]'));

const stepShown = () => toolbar().getAttribute('data-step');

const sorted = (ids: string[]) => [...ids].sort();

const openBuildAlong = async () => {
  await app.page.keyboard.press('Meta+k');
  await app.page.keyboard.type('Build Along');
  await app.page.keyboard.press('Enter');
  await expect.poll(stepShown, { timeout: 180000 }).toBe('1');
};

beforeEach(async () => {
  app = await openApp();
  await app.page.evaluate(
    ({ parts, joints, prints }) => {
      const s = (window as unknown as { __studio: BuildAlongStudio }).__studio;

      s.load({ name: 'Arm', parts, project: { ...s.sceneRecord().project, joints, prints } });
    },
    {
      parts,
      joints,
      prints: [
        {
          id: 'arm-print',
          plate: 1,
          material: 'PLA',
          hash: 'arm-plate',
          parts: parts
            .filter((p) => ['upper-arm', 'forearm'].includes(p.id))
            .map((p) => ({ id: p.id, key: shapeKey(p) })),
          printer: 'default',
          sentAt: '2026-11-14T00:00:00.000Z',
          state: 'printed',
        },
      ],
    },
  );
  await vi.waitFor(async () => expect(await shownParts()).toHaveLength(parts.length), { timeout: 30000 });
}, 120000);

afterEach(async () => {
  await app?.close();
});

describe('Build Along', () => {
  it('shows Cable reach and the incoming cable once when servo ID 3 is installed', async () => {
    const names = ['Shoulder', 'Elbow', 'Wrist'];
    const positions = [0, 75, 400];
    const servos = positions.map((x, i) => ({
      ...component(`xl${i + 1}`, 'dynamixel-xl330-m288'),
      name: `${names[i]} servo`,
      position: [x, 40, 0] as [number, number, number],
    }));
    const adapter = { ...component('adapter', 'robotis-u2d2'), position: [-60, 40, 0] as [number, number, number] };
    const joints = names.map((name, i) =>
      joint(`joint${i}`, name, {
        parent: i ? [`xl${i}`] : ['adapter'],
        child: [`xl${i + 1}`],
        actuators: [`xl${i + 1}`],
        range: [0, 0],
      }),
    );
    const routes = () =>
      app.page.evaluate(() => (window as unknown as { __studio: BuildAlongStudio }).__studio.buildAlongRoutes());
    const check = buildCheckPage(() => app.page);

    await studioLoad(app.page, sceneOf([adapter, ...servos], joints));
    await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();

    const cableReach = check.checkRow('Cable reach');

    await expect.poll(() => cableReach.getAttribute('data-status')).toBe('fail');
    await check.expand(cableReach, 'Cable reach');
    await expect.poll(() => cableReach.textContent()).toMatch(/180 mm cable/);
    await cableReach.getByRole('button', { name: 'Wrist servo', exact: true }).click();
    expect(
      await app.page.evaluate(() => (window as unknown as { __studio: BuildAlongStudio }).__studio.selection()),
    ).toEqual(['xl3']);
    await openBuildAlong();

    const steps = await planSteps();
    const target = steps.findIndex((step) => step.servos.some((servo) => servo.id === 3));
    const incoming = (net: Net) => net.from.id === 'xl2' && net.to.id === 'xl3';

    expect(target).toBeGreaterThanOrEqual(0);
    expect(steps.flatMap((step) => step.routes).filter(incoming)).toHaveLength(1);

    for (let index = 0; index < target; index++) await app.page.keyboard.press('ArrowRight');

    await expect.poll(stepShown).toBe(String(target + 1));
    await expect.poll(routes).toEqual(steps[target].routes);

    const hop = (await routes()).find(incoming)!;

    expect(hop.from.name).toBe('Elbow, ID 2');
    expect(hop.to.name).toBe('Wrist, ID 3');
    expect(hop.route).toMatchObject({ cableSupplyId: 'robot-cable-x3p', lengthMm: 180, status: 'fail' });
    expect(hop.route!.requiredMm).toBeGreaterThan(300);
    expect(hop.route!.points.length).toBeGreaterThan(1);
    expect(await app.page.locator('[data-build-route]').allTextContents()).toContain(
      'Elbow, ID 2 to Wrist, ID 3ROBOTIS Robot Cable-X3P180 mm',
    );
    await app.page.keyboard.press('Escape');
    await expect.poll(routes).toEqual([]);
    expect(app.errors).toEqual([]);
  });

  it('filters the viewport by step, renders servo labels and restores the scene on exit', async () => {
    const before = await sceneParts();

    await openBuildAlong();

    const steps = await planSteps();
    const servoStep = steps.findIndex((step) => step.servos.length > 0);

    expect(steps.length).toBeGreaterThan(1);
    expect(servoStep).toBeGreaterThanOrEqual(0);
    await expect.poll(shownParts).toEqual(sorted(steps[0].shown));
    expect(await shownParts()).not.toEqual(sorted(parts.map((p) => p.id)));
    await app.page.keyboard.press('ArrowRight');
    await expect.poll(stepShown).toBe('2');
    await expect.poll(shownParts).toEqual(sorted(steps[1].shown));
    expect(await shownParts()).not.toEqual(sorted(steps[0].shown));

    const key = servoStep === 0 ? 'ArrowLeft' : 'ArrowRight';

    for (let remaining = Math.abs(servoStep - 1); remaining > 0; remaining--) await app.page.keyboard.press(key);

    await expect.poll(stepShown).toBe(String(servoStep + 1));
    await expect
      .poll(() => app.page.locator(shown('[data-build-label]')).allTextContents())
      .toEqual(steps[servoStep].servos.map((servo) => `${servo.joint}, ID ${servo.id}`));

    const stepParts = await app.page.evaluate(
      () =>
        (window as unknown as { __studio: BuildAlongStudio }).__studio.sceneRecord().project.buildGuide?.stepParts
          ?.ids ?? [],
    );
    const unreadyStep = stepParts.findIndex((ids) => ids.includes('base'));
    const readyStep = stepParts.findIndex(
      (ids) => !ids.includes('base') && ids.some((id) => ['upper-arm', 'forearm'].includes(id)),
    );
    let currentStep = servoStep;

    expect(stepParts).toHaveLength(steps.length);
    expect(unreadyStep).toBeGreaterThanOrEqual(0);
    expect(readyStep).toBeGreaterThanOrEqual(0);

    for (const target of [{ index: unreadyStep }, { index: readyStep, ready: 'true' }]) {
      const key = target.index < currentStep ? 'ArrowLeft' : 'ArrowRight';

      for (let remaining = Math.abs(target.index - currentStep); remaining > 0; remaining--)
        await app.page.keyboard.press(key);

      await expect.poll(stepShown).toBe(String(target.index + 1));
      await expect.poll(() => toolbar().getAttribute('data-ready')).toBe(target.ready ?? null);
      currentStep = target.index;
    }

    await toolbar().getByRole('button', { name: /^Done/ }).click();
    await expect.poll(() => toolbar().count()).toBe(0);
    expect(await sceneParts()).toEqual(before);
    await expect.poll(shownParts).toEqual(sorted(parts.map((p) => p.id)));
    await expect.poll(() => app.page.locator('[data-build-label]').count()).toBe(0);
    expect(app.errors).toEqual([]);
  });
});

describe('Buy All', () => {
  const opened = () => app.page.evaluate(() => (window as unknown as { opened: string[] }).opened);

  it('fills the Amazon cart from the bill of materials, from ⌘K and the list’s menu', async () => {
    const arm = Array.from({ length: 6 }, (_, i) => ({ ...servo(`buy${i}`, i * 40), componentVariant: undefined }));

    await app.page.evaluate((list) => {
      const s = (window as unknown as { __studio: BuildAlongStudio }).__studio;
      const urls: string[] = [];

      s.load({ name: 'Arm', parts: list, project: s.sceneRecord().project });
      (window as unknown as { opened: string[] }).opened = urls;
      window.open = (url) => (urls.push(String(url)), null);
    }, arm);
    await app.page.keyboard.press('Meta+k');
    await app.page.getByLabel('Search commands').fill('Buy All');
    await expect.poll(() => app.page.getByText(/^Buy All$/).count(), { timeout: 15000 }).toBe(1);
    await app.page.keyboard.press('Enter');
    await expect.poll(async () => (await opened()).length).toBe(1);

    const cart = new URL((await opened())[0]);

    expect(`${cart.origin}${cart.pathname}`).toBe('https://www.amazon.com/gp/aws/cart/add.html');
    expect(cart.searchParams.get('ASIN.1')).toBe('B0G39SM9HZ');
    expect(cart.searchParams.get('Quantity.1')).toBe('6');

    await app.page.locator(shown('[role=tab]'), { hasText: 'Build' }).first().click();
    await app.page.locator(shown('button[aria-label="Export bill of materials"]')).click();
    await app.page.getByRole('menuitem', { name: /^Buy All/ }).click();
    await expect.poll(opened).toEqual([cart.href, cart.href]);
    expect(app.errors).toEqual([]);
  }, 90000);
});
