import { describe, expect, it } from 'vitest';
import { newRoutine, type RoutineEdit } from './edit';
import { greetingRoutine } from './greeting';
import { editInSet, putInSet } from './routineSet';
import type { Routine, Step } from './schema';
import { driveStep, sayStep } from './stepFactory';

const CAPS = ['legs', 'camera', 'speaker'] as const;
const MAIN = { parent: 'start', key: 'onTimeout' } as const;

const edit = (list: Routine[], id: string, edits: RoutineEdit[]) => editInSet(list, { id, edits, capabilities: CAPS });

const find = (routine: Routine, id: string): Step | undefined => {
  const all: Step[] = [];
  const walk = (steps: Step[]) =>
    steps.forEach((s) => {
      all.push(s);

      if (s.kind === 'if') walk([...s.then, ...s.else]);
      else if (s.kind === 'together') s.branches.forEach(walk);
      else walk([...s.onTimeout, ...s.onFail]);
    });

  walk([routine.base, ...routine.reactions.flatMap((r) => r.steps)]);

  return all.find((s) => s.id === id);
};

describe('hand edits and agent edits on the same Routine', () => {
  it('an agent edit after a hand edit keeps the hand edit', () => {
    let list = [greetingRoutine()];

    list = edit(list, 'greeting', [{ op: 'update', id: 'helloName', patch: { text: 'Hi {name}' } }]).list;
    list = edit(list, 'greeting', [{ op: 'update', id: 'excuseMe', patch: { text: 'Pardon me' } }]).list;

    expect(find(list[0], 'helloName')).toMatchObject({ text: 'Hi {name}' });
    expect(find(list[0], 'excuseMe')).toMatchObject({ text: 'Pardon me' });
  });

  it('a hand edit after an agent edit keeps the agent edit', () => {
    let list = [newRoutine({ id: 'hand', name: 'By Hand', mover: 'legs' })];

    list = edit(list, 'hand', [{ op: 'insert', at: { seq: MAIN, index: 0 }, step: driveStep('drive') }]).list;
    list = edit(list, 'hand', [{ op: 'insert', at: { seq: MAIN, index: 1 }, step: sayStep('hello', 'Done') }]).list;
    list = edit(list, 'hand', [{ op: 'update', id: 'drive', patch: { move: { distance: 2 } } }]).list;

    expect(list[0].base.onTimeout.map((s) => s.id)).toEqual(['drive', 'hello']);
    expect(find(list[0], 'drive')).toMatchObject({ move: { distance: 2 } });
    expect(list[0].requires).toEqual(['legs', 'speaker']);
  });

  it('a Routine the agent rewrites from what it read keeps the hand edit', () => {
    let list = [greetingRoutine()];

    list = edit(list, 'greeting', [{ op: 'update', id: 'helloName', patch: { text: 'Hi {name}' } }]).list;

    const read = structuredClone(list[0]);

    read.name = 'Greet Everyone';
    list = putInSet(list, read);

    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Greet Everyone');
    expect(find(list[0], 'helloName')).toMatchObject({ text: 'Hi {name}' });
  });

  it('refuses an edit that would break the Routine, and keeps what was there', () => {
    const list = [greetingRoutine()];
    const broken = edit(list, 'greeting', [{ op: 'update', id: 'helloName', patch: { timeoutMs: -1 } }]);

    expect(broken.list).toBe(list);
    expect(broken.errors?.[0].code).toBe('missing-timeout');
  });
});
