import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { launchPackaged, type RunningApp } from '../../e2e/app/packagedApp';
import { repoPath } from '../lib/need';
import { freshSeed, seededRng, shuffled, type Rng } from '../zoo/rng';
import { FAULT_KINDS, faultPlaces, namedControls, plantFaults, type FaultSpec } from './faults';
import { loadPersonaLab, screenOf, type PersonaLab } from './screen';
import { PERSONA_BARS, personaScore, type PlantedFault, type SessionFindings } from './personaScore';

const RAIL = 'nav[aria-label="Sidebar views"] button';
const SESSION_MINUTES = 10;
const PER_SESSION = PERSONA_BARS.faults / PERSONA_BARS.sessions;
const SESSION_CAP_MS = (SESSION_MINUTES + 5) * 60 * 1000;
const CLOSE_MS = 30 * 1000;
const PROGRESS = repoPath('verify', 'out', 'rehearsal', 'persona-progress.log');

const progress = (line: string) => {
  fs.mkdirSync(path.dirname(PROGRESS), { recursive: true });
  fs.appendFileSync(PROGRESS, `${new Date().toISOString()} ${line}\n`);
};

function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took over ${Math.round(ms / 1000)} s`)), ms);
  });

  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function closeApp(run: RunningApp) {
  await within(run.close(), CLOSE_MS, 'closing the app').catch(() => run.app.process().kill('SIGKILL'));
}

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

interface SessionOptions {
  index: number;
  rng: Rng;
  kinds: FaultSpec['kind'][];
}

interface Live {
  run?: RunningApp;
  abandoned: boolean;
}

async function session(lab: PersonaLab, options: SessionOptions & { live: Live }) {
  const run = await launchPackaged();

  options.live.run = run;

  try {
    if (options.live.abandoned) throw new Error(`session ${options.index} was abandoned while launching`);

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
    const places = await faultPlaces(run.page);
    const planted: PlantedFault[] = specs.map((s) => {
      const held = places[s.name] ?? [];
      const first = held[0];

      return {
        session: options.index,
        ...s,
        rect: first ? { x: first.x, y: first.y, width: first.width, height: first.height } : null,
        held,
      };
    });

    return { planted, found: { session: options.index, findings } as SessionFindings };
  } finally {
    await closeApp(run);
  }
}

async function guardedSession(lab: PersonaLab, options: SessionOptions) {
  for (let attempt = 1; ; attempt++) {
    const live: Live = { abandoned: false };

    progress(`session ${options.index} attempt ${attempt}: ${options.kinds.join(', ')}`);

    try {
      const result = await within(session(lab, { ...options, live }), SESSION_CAP_MS, `session ${options.index}`);

      progress(`session ${options.index}: ${result.found.findings.length} findings`);

      return result;
    } catch (error) {
      progress(`session ${options.index} attempt ${attempt} failed: ${(error as Error).message}`);
      live.abandoned = true;

      if (live.run) await closeApp(live.run);

      if (attempt >= 2) throw error;
    }
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
        const result = await guardedSession(lab, { index, rng, kinds: own });

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
