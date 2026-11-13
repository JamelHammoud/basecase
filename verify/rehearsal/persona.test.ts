import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { launchPackaged } from '../../e2e/app/packagedApp';
import { repoPath } from '../lib/need';
import { freshSeed, seededRng, shuffled, type Rng } from '../zoo/rng';
import { FAULT_KINDS, faultRects, namedControls, plantFaults, type FaultSpec } from './faults';
import { loadPersonaLab, screenOf, type PersonaLab } from './screen';
import { PERSONA_BARS, personaScore, type PlantedFault, type SessionFindings } from './personaScore';

const RAIL = 'nav[aria-label="Sidebar views"] button';
const SESSION_MINUTES = 10;
const PER_SESSION = PERSONA_BARS.faults / PERSONA_BARS.sessions;

async function openView(page: Page, rng: Rng): Promise<string> {
  const rail = page.locator(RAIL);
  const names = await rail.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  const index = Math.floor(rng() * names.length) % names.length;

  await rail.nth(index).click();
  await sleep(800);

  return names[index] || 'first';
}

const goalsFor = (view: string) => [
  `You are new to Basecase. In the ${view} view, try every control you can see and do one useful thing with each.`,
  'Say where anything was confusing, broken, unreadable, too small, slow or misleading.',
];

async function session(lab: PersonaLab, options: { index: number; rng: Rng; kinds: FaultSpec['kind'][] }) {
  const run = await launchPackaged();

  try {
    const view = await openView(run.page, options.rng);
    const controls = shuffled(options.rng, [...new Set(await namedControls(run.page))]);

    if (controls.length < options.kinds.length) throw new Error(`The ${view} view shows too few named controls`);

    const specs = options.kinds.map((kind, i) => ({ kind, name: controls[i] }));

    await plantFaults(run.page, specs);
    await sleep(500);

    const { findings } = await lab.runPersona({
      screen: screenOf(run.page),
      goals: goalsFor(view),
      minutes: SESSION_MINUTES,
    });
    const rects = await faultRects(run.page);
    const planted: PlantedFault[] = specs.map((s) => ({
      session: options.index,
      ...s,
      rect: rects[s.name]?.[0] ?? null,
      seen: rects[s.name] ?? [],
    }));

    return { planted, found: { session: options.index, findings } as SessionFindings };
  } finally {
    await run.close();
  }
}

describe('PersonaLab against 30 planted usability faults', () => {
  it(
    'finds at least 80% of the faults with at least half its findings on a fault',
    async () => {
      const lab = await loadPersonaLab();
      const seed = freshSeed();
      const rng = seededRng(seed);
      const kinds = shuffled(rng, [...FAULT_KINDS, ...FAULT_KINDS, ...FAULT_KINDS]);
      const planted: PlantedFault[] = [];
      const found: SessionFindings[] = [];

      for (let index = 0; index < PERSONA_BARS.sessions; index++) {
        const own = kinds.slice(index * PER_SESSION, (index + 1) * PER_SESSION);
        const result = await session(lab, { index, rng, kinds: own });

        planted.push(...result.planted);
        found.push(result.found);
      }

      const score = personaScore(planted, found);

      fs.mkdirSync(repoPath('verify', 'out', 'rehearsal'), { recursive: true });
      fs.writeFileSync(
        repoPath('verify', 'out', 'rehearsal', `persona-${seed.slice(0, 12)}.json`),
        JSON.stringify({ planted, found, score }, null, 2),
      );
      expect(score.problems).toEqual([]);
    },
    4 * 60 * 60 * 1000,
  );
});
