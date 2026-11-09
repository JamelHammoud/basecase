import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openApp, type App } from '../../e2e/harness';
import { fixtureRobots } from '../../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../../src/types/robotics';
import {
  dedupe,
  installHelpers,
  scanAxe,
  scanControls,
  scanCopy,
  scanGreys,
  scanType,
  type Violation,
} from './uiRules';

const RAIL = 'nav[aria-label="Sidebar views"] button';
const SETTLE_MS = 600;

type Scan = (page: App['page']) => Promise<Violation[]>;

let app: App;

function axePath(): string {
  try {
    return createRequire(import.meta.url).resolve('axe-core/axe.min.js');
  } catch {
    throw new Error('axe-core is not installed: add it as a devDependency so the gate can run axe');
  }
}

async function eachView(scan: Scan): Promise<string[]> {
  const page = app.page;
  const rail = page.locator(RAIL);
  const names = await rail.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const out: string[] = [];
  const seen = new Set<string>();
  const record = (view: string, found: Violation[]) => {
    const fresh = dedupe(found).filter((v) => !seen.has(`${v.rule}|${v.where}`));

    fresh.forEach((v) => seen.add(`${v.rule}|${v.where}`));
    out.push(...fresh.map((v) => `${view}: ${v.rule}: ${v.where}`));
  };

  record('start', await scan(page));

  for (const [i, name] of names.entries()) {
    await rail.nth(i).click();
    await sleep(SETTLE_MS);
    await installHelpers(page);
    record(name || `view ${i + 1}`, await scan(page));
  }

  await page.keyboard.press('Meta+k');
  await sleep(SETTLE_MS);
  record('command palette', await scan(page));
  await page.keyboard.press('Escape');

  return out;
}

beforeAll(async () => {
  app = await openApp();

  const robot = fixtureRobots().find((r) => r.id === 'arm-6dof')!;

  await app.page.evaluate(
    (record) => (window as unknown as { __studio: { load: (r: unknown) => void } }).__studio.load(record),
    { name: 'Rehearsal', parts: robot.parts, project: { ...DEFAULT_PROJECT, joints: robot.joints } },
  );
  await installHelpers(app.page);
}, 180000);

afterAll(async () => {
  await app?.close();
});

describe('mechanised UI rules on every view', () => {
  it('controls are at least 32px (icon-only buttons 28px)', async () => {
    expect(await eachView((p) => scanControls(p))).toEqual([]);
  }, 300000);

  it('no text under 12px except key caps', async () => {
    expect(await eachView((p) => scanType(p))).toEqual([]);
  }, 300000);

  it('greys are neutral (R = G = B)', async () => {
    expect(await eachView((p) => scanGreys(p))).toEqual([]);
  }, 300000);

  it('copy passes the §3c lint', async () => {
    expect(await eachView((p) => scanCopy(p))).toEqual([]);
  }, 300000);

  it('axe finds no serious or critical WCAG 2 A/AA violation', async () => {
    const path = axePath();

    expect(await eachView((p) => scanAxe(p, path))).toEqual([]);
  }, 300000);
});
