import loadMujoco from '@mujoco/mujoco';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { runArena } from './arena';
import { fixtureModel } from './fixtureModels';
import type { ForgeJob } from './forgeRunner';
import { holdingPolicy, readyStand } from './hubSkillFixtures';
import { validationReport } from './kitValidation';
import { runSkillsJob } from './skillsJob';

vi.mock('./arena', async (original) => ({ ...(await original<typeof import('./arena')>()), runArena: vi.fn() }));
vi.mock('./kitValidation', async (original) => ({
  ...(await original<typeof import('./kitValidation')>()),
  validationReport: vi.fn(),
}));
vi.mock('../routines/kitLibrary', () => ({ loadKitLibrary: async () => [] }));

const model = fixtureModel('quad-servo');
const judgmentSalt = '12'.repeat(32);
const evidence = readyStand(model, 'quad').evidence!;
let mj: Awaited<ReturnType<typeof loadMujoco>>;

beforeAll(async () => {
  mj = await loadMujoco();
});

async function replay() {
  const jobs: ForgeJob[] = [];
  const salts: string[] = [];

  vi.mocked(validationReport).mockImplementation(async (input) => {
    if (!input.salt) throw new Error('Validation drew a new key during replay.');

    salts.push(input.salt);

    return {
      score: Number.parseInt(input.salt.slice(0, 4), 16),
      checks: [],
      wallS: 0,
      transitions: {
        binding: { physics: 'p', actuators: 'a', controllers: 'c' },
        checks: [],
        passed: true,
        reason: '',
        starts: { skill: 'motor-kit', joints: [], samples: [] },
        wallS: 0,
        simulatedS: 0,
      },
    };
  });
  vi.mocked(runArena).mockImplementation(async (input) => {
    if (!input.salt) throw new Error('Arena drew a new key during replay.');

    salts.push(Array.from(input.salt).join(','));

    return {
      ...evidence,
      passed: false,
      variants: evidence.variants.map((variant) => ({ ...variant, passes: input.salt![0] % 16 })),
    };
  });
  await runSkillsJob(
    { type: 'kit', model, design: 'quad', entry: 'velocity-tracking', seed: 31 },
    {
      mj,
      localSalt: judgmentSalt,
      save: async () => {},
      forge: async (job) => {
        jobs.push(job);

        return {
          ok: true,
          policy: holdingPolicy(job.job),
          events: [],
          stderr: '',
          run: `policy-${jobs.length}`,
        };
      },
    },
  );

  return { jobs, salts };
}

describe('judgment-dependent remote curriculum replay', () => {
  it('repeats policy ranking, candidate trials and the exact later warm-start inputs', async () => {
    const first = await replay();
    const restored = await replay();

    expect(first.jobs).toHaveLength(3);
    expect(first.jobs[2].job.warmStart).toMatch(/^policy-[12]$/);
    expect(first.salts.length).toBeGreaterThan(3);
    expect(restored).toEqual(first);
    expect(JSON.stringify(first.jobs)).not.toContain(judgmentSalt);
    expect(JSON.stringify(first.jobs)).not.toContain('localSalt');
    expect(JSON.stringify(first.jobs)).not.toContain('judgment');
  });
});
