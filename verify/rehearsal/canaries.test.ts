import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { personaScore, type PlantedFault, type SessionFindings } from './personaScore';
import { rehearsalProblems } from './report.mjs';
import { installHelpers, scanControls, scanCopy, scanGreys, scanType } from './uiRules';

let browser: Browser;
let page: Page;

const PLANTED = `
  <body style="background:#1b1b1b;color:#ffffff;font-size:14px">
    <input aria-label="Name" style="height:20px">
    <p style="font-size:10px">Tiny print</p>
    <div style="background:#1e2024;width:80px;height:40px">Slate card</div>
    <p>No parts yet</p>
  </body>`;

const faults: PlantedFault[] = Array.from({ length: 30 }, (_, i) => ({
  session: Math.floor(i / 3),
  kind: 'tiny',
  name: `Control ${i}`,
  rect: { x: 10 * i, y: 10, width: 8, height: 8 },
}));

const gate = (id: string, state: 'required' | 'parked', parked?: string) => ({ id, state, parked });

beforeAll(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage();
  await page.setContent(PLANTED);
  await installHelpers(page);
}, 120000);

afterAll(async () => {
  await browser?.close();
});

describe('Stage 7 canaries: the rehearsal’s own judges catch planted faults', () => {
  it('canary small control: a 20px input passes the control check', async () => {
    expect(await scanControls(page)).toEqual([]);
  });

  it('canary small type: 10px text passes the type check', async () => {
    expect(await scanType(page)).toEqual([]);
  });

  it('canary tinted grey: a slate card passes the grey check', async () => {
    expect(await scanGreys(page)).toEqual([]);
  });

  it('canary banned copy: “No parts yet” passes the copy lint', async () => {
    expect(await scanCopy(page)).toEqual([]);
  });

  it('canary silent persona: a persona that reports nothing meets the recall bar', () => {
    const quiet: SessionFindings[] = Array.from({ length: 10 }, (_, session) => ({ session, findings: [] }));

    expect(personaScore(faults, quiet).problems).toEqual([]);
  });

  it('canary shotgun persona: a persona that flags everything meets the precision bar', () => {
    const noisy: SessionFindings[] = Array.from({ length: 10 }, (_, session) => ({
      session,
      findings: [
        ...faults.filter((f) => f.session === session).map((f) => ({ where: f.name, problem: 'broken' })),
        ...Array.from({ length: 20 }, (__, k) => ({ where: `Other ${k}`, problem: 'broken' })),
      ],
    }));

    expect(personaScore(faults, noisy).problems).toEqual([]);
  });

  it('canary void counted green: a voided required gate passes the rehearsal', () => {
    const results = { 's2-cases-play': { ok: true, voided: 'machine busy' } };

    expect(rehearsalProblems([gate('s2-cases-play', 'required')], results)).toEqual([]);
  });

  it('canary silent park: a parked gate with no reason passes the rehearsal', () => {
    expect(rehearsalProblems([gate('s3-anythingzoo-full', 'parked')], {})).toEqual([]);
  });
});
