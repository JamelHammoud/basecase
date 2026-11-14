import loadMujoco from '@mujoco/mujoco';
import { describe, expect, it, vi } from 'vitest';
import type { Routine, SkillContract, TransitionProof } from '../../routines/schema';
import { fixtureRobots } from '../../sim/fixtures/robots';
import type { CaseInput } from '../caseLogic';
import { CASE_FORMAT_VERSION, type Case } from '../schema';
import { runCase } from '../testing';
import { openTestFrame } from './fixtures/codeFrames';
import { createSignalBus } from './signalBus';

const hexapod = fixtureRobots().find((r) => r.id === 'hexapod')!;
const proof: TransitionProof = { seeds: 8, falls: 0, modelHash: 'fixture' };
const LEGS = ['settle', 'lift-front', 'lift-back'];

const legSkill = (id: string): SkillContract => ({
  id,
  status: 'ready',
  rateHz: 50,
  holds: ['body'],
  startsFrom: ['standing'],
  endsIn: 'standing',
  interrupt: 'any',
  stopVia: 'settle',
  transitions: Object.fromEntries(LEGS.filter((other) => other !== id).map((other) => [other, proof])),
});

const KEYS: Record<string, string> = { c: 'lift-front', g: 'lift-back' };

const pianoLogic = (): Routine => ({
  schema: 1,
  id: 'piano-legs',
  name: 'Piano Legs',
  requires: ['legs'],
  base: { kind: 'do', id: 'start', skill: 'settle', holds: ['body'], timeoutMs: 4000, onTimeout: [], onFail: [] },
  watchers: [{ id: 'piano', model: 'live-input', rateHz: 20, maxAgeMs: 300, publishes: { type: 'text' } }],
  reactions: Object.entries(KEYS).map(([note, skill]) => ({
    id: `on-${note}`,
    when: { fact: 'piano', is: note },
    cooldownMs: 0,
    onRetrigger: 'ignore' as const,
    body: 'stopFirst' as const,
    steps: [{ kind: 'do' as const, skill, holds: ['body'], timeoutMs: 1500, onTimeout: [], onFail: [] }],
  })),
  safeStop: 'settle',
});

const pianoCase = (): Case => ({
  formatVersion: CASE_FORMAT_VERSION,
  id: 'hexapod-piano',
  name: 'Hexapod Piano',
  brief: 'Play the legs.',
  slot: { needs: ['legs'], binding: {} },
  world: { objects: [] },
  controls: [],
  reference: { timeline: [] },
  task: {
    seconds: 4,
    probes: [],
    contract: {
      version: 1,
      success: {
        eventually: { window: 'whole', state: { atom: { expr: { signal: 'elapsed' }, cmp: '>', value: 1, scale: 1 } } },
      },
      failures: [],
    },
  },
  logic: pianoLogic(),
});

const PIANO = `<script>
for (const note of ['c', 'd', 'e', 'f', 'g']) {
  const key = document.createElement('button');
  key.dataset.note = note;
  key.addEventListener('pointerdown', () => basecase.event('piano', note));
  document.body.append(key);
}
</script>`;

describe('a piano code panel', { timeout: 60_000 }, () => {
  it('plays a hexapod’s legs through the Case’s logic', async () => {
    const bus = createSignalBus();
    const piano = openTestFrame(PIANO, {
      bus,
      scope: { declared: new Set(), probes: new Set(), inputs: new Set(['code']) },
    });
    const played: CaseInput[] = [];

    for (const [at, note] of [
      [1, 'c'],
      [2.5, 'g'],
    ] as const) {
      piano.body.find('note', note)!.dispatch('pointerdown');
      await vi.waitFor(() => expect(piano.log.events).toHaveLength(played.length + 1));

      const [name, value] = piano.log.events.at(-1)!;

      played.push({ at, name, value });
    }

    piano.close();

    const result = await runCase(await loadMujoco(), pianoCase(), hexapod, {
      controller: 'reference',
      skills: LEGS.map(legSkill),
      inputs: played,
    });
    const moves = (result.logic?.trace ?? []).flatMap((e) =>
      e.kind === 'control' && e.skill !== 'settle' ? [[e.skill, e.t] as const] : [],
    );

    expect(result.refusal).toBeUndefined();
    expect(moves.map(([skill]) => skill)).toEqual(['lift-front', 'lift-back']);
    expect(moves[0][1]).toBeGreaterThanOrEqual(1000);
    expect(moves[0][1]).toBeLessThanOrEqual(1200);
    expect(moves[1][1]).toBeGreaterThanOrEqual(2500);
    expect(moves[1][1]).toBeLessThanOrEqual(2700);
  });
});
