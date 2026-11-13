import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webRequest } from '../utils/platform/web/webBackend';
import { currentDesign, skillFiles, skillFromTraining, skillHash, type Skill } from './artifacts';
import { fixtureModel } from './fixtureModels';
import type { ForgeJob, ForgeOutcome } from './forgeRunner';
import { kitEnvironment } from './kitEnvironment';
import type { KitOutcome } from './motorKit';
import type { SkillRunner } from './skillsClient';
import { skillRows, type SkillJob } from './skillRows';
import { skillsPlatform, type SkillStore, type TabEngine } from './skillsPlatform';
import { designOf, SkillsRuntime } from './skillsRuntime';
import type { SkillRecord } from './skillRecords';
import { trainerForge } from './trainerForge';

const stored = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../utils/platform/web/idb', () => ({
  idbGet: (store: string, key: string) => Promise.resolve(stored.get(`${store}/${key}`)),
  idbPut: (store: string, key: string, value: unknown) => Promise.resolve(void stored.set(`${store}/${key}`, value)),
  idbAll: () => Promise.resolve([]),
  idbDelete: () => Promise.resolve(),
}));

vi.mock('./trainerForge', async (original) => {
  const actual = await original<typeof import('./trainerForge')>();

  return { ...actual, trainerForge: vi.fn(() => () => Promise.resolve(ran('app-trainer'))) };
});

const model = fixtureModel('quad-servo');
const design = designOf(model);
const JOB: ForgeJob = { name: 'Motor Kit: stand', xml: model.xml, job: { minutes: 1 } };

const ran = (run: string): ForgeOutcome => ({ ok: true, policy: null, events: [], stderr: '', run });

const webStore: SkillStore = {
  saveSkill: async (payload) => {
    const res = await webRequest('/skill-save', { method: 'POST', body: JSON.stringify(payload) });

    if (!res.ok) throw new Error(String((await res.json()).error));
  },
  getSkill: async (hash) => (await webRequest(`/skill?hash=${hash}`)).json(),
};

function provedStand(): Skill {
  const environment = kitEnvironment(model, 'stand');
  const skill = skillFromTraining({
    name: 'Stand',
    start: null,
    current: currentDesign({ design, model, environment }),
    environment,
    controller: { kind: 'hold' },
  });
  const variants = (['held-out', 'half-timestep', 'latency'] as const).map((variant) => ({
    variant,
    trials: 32,
    passes: 32,
    lowerBound: 0.91,
    diverged: 0,
    failures: {},
  }));
  const { contract, physics, actuators } = skill.binding;

  return {
    ...skill,
    evidence: {
      arenaVersion: 1,
      binding: { contract, physics, actuators, environment: 'e'.repeat(64) },
      confidence: 0.95,
      bar: 0.75,
      variants,
      lowerBound: 0.91,
      passed: true,
      conditions: [],
      summary: 'Passed 32 of 32',
      saltCommitment: 'f'.repeat(64),
    },
  };
}

const cost = { wallS: 1, steps: 1, forgeRuns: 1 };

function kitRunner(outcome: (skill: Skill) => KitOutcome): SkillRunner {
  return (async (_job, ports) => {
    const skill = provedStand();

    await ports.forge(JOB);

    const reply = outcome(skill);

    if (reply.kind === 'skill') await ports.save(skillFiles(skillHash(skill)).skill, JSON.stringify(skill));

    return { type: 'kit', outcome: reply };
  }) as SkillRunner;
}

function webRuntime(runner: SkillRunner) {
  const records: SkillRecord[] = [];
  const engine = vi.fn<TabEngine>(() => () => Promise.resolve(ran('tab-run-1')));
  const platform = skillsPlatform({ web: true, workspaceId: 'w', store: webStore, tabEngine: async () => engine });
  const runtime = new SkillsRuntime({
    runner,
    forge: platform.forge,
    save: platform.save,
    loadSkill: platform.loadSkill,
    onRecord: (record) => records.push(record),
    onChange: () => {},
  });

  return { runtime, records, engine };
}

const standState = (records: SkillRecord[], jobs: SkillJob[] = []) =>
  skillRows({ model, design, records, jobs }).find((r) => r.kit === 'stand')?.state;

beforeEach(() => {
  stored.clear();
  vi.mocked(trainerForge).mockClear();
});

describe('where the skills runtime trains', () => {
  it('sends Forge runs to the tab engine on the web, one engine per run, with progress in the row', async () => {
    const progress: Array<{ share: number | null; message: string }> = [];
    const engine = vi.fn<TabEngine>((options) => () => {
      options.onEvent?.({ type: 'status', message: 'Building environments' });
      options.onEvent?.({ type: 'progress', elapsedS: 15, budgetS: 60 });

      return Promise.resolve(ran('tab-run-1'));
    });
    const platform = skillsPlatform({ web: true, workspaceId: 'w', store: webStore, tabEngine: async () => engine });
    const forge = platform.forge({
      background: false,
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p),
    });

    expect((await forge(JOB)).run).toBe('tab-run-1');
    await forge(JOB);
    expect(engine).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([
      { share: null, message: 'Building environments' },
      { share: 0.25, message: 'Training' },
      { share: null, message: 'Building environments' },
      { share: 0.25, message: 'Training' },
    ]);
    expect(trainerForge).not.toHaveBeenCalled();
    expect(platform.background).toBe(false);
  });

  it('sends them to the app’s trainer on the desktop', async () => {
    const tabEngine = vi.fn(async () => (() => () => Promise.resolve(ran('tab'))) as TabEngine);
    const platform = skillsPlatform({ web: false, workspaceId: 'w', store: webStore, tabEngine });
    const forge = platform.forge({ background: true, signal: new AbortController().signal, onProgress: () => {} });

    expect((await forge(JOB)).run).toBe('app-trainer');
    expect(trainerForge).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'w', background: true }));
    expect(tabEngine).not.toHaveBeenCalled();
    expect(platform.background).toBe(true);
  });
});

describe('a Kit skill trained on the web', () => {
  it('saves a passed skill through the web route, and it reloads as a ready row', async () => {
    const { runtime, records, engine } = webRuntime(
      kitRunner((skill) => ({ kind: 'skill', skill, environment: kitEnvironment(model, 'stand'), cost })),
    );

    expect(runtime.trainKit(model, 'stand')).toBeNull();
    await runtime.settled();

    expect(engine).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(standState(records)).toEqual({ kind: 'ready', arena: '32 of 32 tries, at least 91%' });

    const reloaded = skillsPlatform({ web: true, workspaceId: 'w', store: webStore });

    expect(await reloaded.loadSkill(records[0].hash)).toEqual(provedStand());
  });

  it('leaves the row untrained when Arena refuses', async () => {
    const refused: KitOutcome = { kind: 'refused', reason: 'No Stand policy passed Arena.', relaxation: null, cost };
    const { runtime, records } = webRuntime(kitRunner(() => refused));

    runtime.trainKit(model, 'stand');
    await runtime.settled();

    expect(records).toEqual([]);
    expect(standState(records)).toEqual({ kind: 'untrained' });
    expect(stored.size).toBe(0);
  });
});
