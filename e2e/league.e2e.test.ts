import fs from 'node:fs/promises';
import type { Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { FrozenStandings, LeagueBoard } from '../src/leagues/types';
import { exposeTestHooks, launchChrome } from './harness';

let browser: Browser;
const base = inject('webUrl');

beforeAll(async () => {
  browser = await launchChrome();
});

afterAll(async () => {
  await browser?.close();
});

describe('League board', () => {
  it('selects a frozen entry, replays its failed seed and opens its robot and Case in the studio', async () => {
    const frozen: FrozenStandings = JSON.parse(await fs.readFile('public/leagues/rover-sprint/results.json', 'utf8'));
    const board: LeagueBoard = JSON.parse(await fs.readFile('public/leagues/rover-sprint/board.json', 'utf8'));
    const standing = frozen.standings.find((row) => row.outcomes.some((outcome) => !outcome.passed))!;
    const entry = board.entries.find((value) => value.id === standing.entryId)!;
    const failed = standing.outcomes.find((outcome) => !outcome.passed)!;
    const bundle = JSON.parse(await fs.readFile(`public/leagues/rover-sprint/${standing.entryId}.json`, 'utf8'));
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await exposeTestHooks(page);
    await page.goto(`${base}/l/rover-sprint`);
    await expect.poll(() => page.getByText('Frozen standings', { exact: true }).count()).toBe(1);
    await page.getByRole('button', { name: entry.robotName, exact: true }).click();
    await page.getByRole('button', { name: String(failed.seed), exact: true }).click();
    await page.getByRole('button', { name: 'Replay Seed', exact: true }).click();
    await expect.poll(() => page.getByTestId('league-replay-verdict').count()).toBe(1);
    expect(await page.getByTestId('league-replay-verdict').innerText()).toContain(failed.failed[0]);
    await expect.poll(() => page.getByTestId('gallery-replay').count()).toBe(1);
    await page
      .getByRole('button', { name: String(frozen.seeds.find((seed) => seed !== failed.seed)), exact: true })
      .click();
    expect(await page.getByTestId('league-replay-verdict').count()).toBe(0);
    expect(await page.getByTestId('gallery-replay').count()).toBe(0);
    await page.getByRole('button', { name: 'Open Scene', exact: true }).click();
    await page.waitForURL(`${base}/`);
    await page.waitForFunction(() => Boolean((window as unknown as { __studio?: unknown }).__studio));

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __studio: { sceneRecord: () => { parts: unknown[] } } }).__studio.sceneRecord()
              .parts.length,
        ),
      )
      .toBe(bundle.robot.parts.length);

    const scene = await page.evaluate(() =>
      (
        window as unknown as { __studio: { sceneRecord: () => { parts: unknown[]; project: { cases: unknown[] } } } }
      ).__studio.sceneRecord(),
    );

    expect(scene.parts).toEqual(bundle.robot.parts);
    expect(scene.project.cases).toEqual([bundle.case]);
    await page.close();
  });
});
