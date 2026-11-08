import { describe, expect, it } from 'vitest';
import { applyEdit, applyEdits, insertPoints, newRoutine, type RoutineEdit, type StepAt, uniqueStepId } from './edit';
import { commit, redo, startHistory, undo } from './editHistory';
import { routineToFlow, flowToRoutine } from './flow';
import { FIXTURE_SKILLS } from './fixtureSkills';
import { withNeeds } from './routineNeeds';
import type { Routine, Step } from './schema';
import { validateRoutine } from './schema';
import { stepChoices } from './stepMenu';
import { compileRoutine, generateScenarios, runScenario } from './testing';

const MAIN = { parent: 'start', key: 'onTimeout' } as const;
const at = (index: number, seq: StepAt['seq'] = MAIN): StepAt => ({ seq, index });

const blank = () => newRoutine({ id: 'hand', name: 'By Hand', mover: 'legs' });

function add(routine: Routine, key: string, where: StepAt): Routine {
  const choice = stepChoices({ routine, at: where, skills: FIXTURE_SKILLS }).find((c) => c.key === key);

  if (!choice) throw new Error(`No ${key} in the menu`);

  return applyEdits(routine, choice.make(routine, where));
}

const mainIds = (routine: Routine) => routine.base.onTimeout.map((s) => s.id);

function built(): Routine {
  let r = blank();

  r = add(r, 'drive', at(0));
  r = add(r, 'stop', at(1));
  r = add(r, 'skill:wave', at(2));

  return r;
}

describe('editing a Routine by hand', () => {
  it('starts with Start and an end, and compiles', () => {
    const r = blank();
    const points = insertPoints(r);

    expect(validateRoutine(r).ok).toBe(true);
    expect(compileRoutine(r).ok).toBe(true);
    expect(points.map((p) => [p.from, p.to, p.kind])).toEqual([
      ['start', 'end:start:timeout', 'timeout'],
      ['start', 'end:start:fail', 'fail'],
    ]);
  });

  it('inserts steps with ids of their own', () => {
    let r = add(blank(), 'drive', at(0));

    r = add(r, 'drive', at(1));

    expect(mainIds(r)).toEqual(['drive', 'drive2']);
    expect(r.base.onTimeout[0]).toMatchObject({ kind: 'do', skill: 'walk', move: { distance: 1 } });
    expect(uniqueStepId(r, 'drive')).toBe('drive3');
  });

  it('removes a step, but never the start', () => {
    const r = built();

    expect(mainIds(applyEdit(r, { op: 'remove', id: 'stop' }))).toEqual(['drive', 'wave']);
    expect(applyEdit(r, { op: 'remove', id: 'start' })).toBe(r);
    expect(applyEdit(r, { op: 'remove', id: 'nowhere' })).toBe(r);
  });

  it('moves a step along the main path and into a branch, never into itself', () => {
    let r = built();

    r = applyEdit(r, { op: 'move', id: 'wave', to: at(0) });
    expect(mainIds(r)).toEqual(['wave', 'drive', 'stop']);

    r = applyEdit(r, { op: 'move', id: 'wave', to: at(3) });
    expect(mainIds(r)).toEqual(['drive', 'stop', 'wave']);

    r = add(r, 'if', at(3));
    r = applyEdit(r, { op: 'move', id: 'wave', to: at(0, { parent: 'if', key: 'then' }) });

    const branch = r.base.onTimeout.find((s) => s.id === 'if') as Extract<Step, { kind: 'if' }>;

    expect(branch.then.map((s) => s.id)).toEqual(['wave']);
    expect(applyEdit(r, { op: 'move', id: 'if', to: at(0, { parent: 'if', key: 'else' }) })).toBe(r);
  });

  it('sets fields without touching the paths under a step', () => {
    const r = applyEdit(built(), { op: 'update', id: 'drive', patch: { move: { distance: 2.5 }, onFail: [] } });
    const drive = r.base.onTimeout[0] as Extract<Step, { kind: 'do' }>;

    expect(drive.move).toEqual({ distance: 2.5 });
    expect(applyEdit(r, { op: 'rename', name: '  Patrol ' }).name).toBe('Patrol');
  });

  it('undoes and redoes edits', () => {
    const first = blank();
    const second = add(first, 'drive', at(0));
    const third = add(second, 'say', at(1));
    let h = commit(commit(startHistory(first), second), third);

    h = undo(h);
    expect(h.present).toBe(second);
    h = undo(undo(h));
    expect(h.present).toBe(first);
    h = redo(h);
    expect(h.present).toBe(second);
    expect(commit(h, h.present)).toBe(h);
    expect(commit(h, third).future).toEqual([]);
  });

  it('repeats the step above with fresh ids', () => {
    const r = add(built(), 'repeat', at(1));

    expect(mainIds(r)).toEqual(['drive', 'drive2', 'stop', 'wave']);
    expect(add(blank(), 'drive', at(0)).base.onTimeout).toHaveLength(1);
    expect(stepChoices({ routine: blank(), at: at(0), skills: FIXTURE_SKILLS }).some((c) => c.key === 'repeat')).toBe(
      false,
    );
  });

  it('adds what the steps need: a watcher for If, a speaker for Say', () => {
    let r = add(built(), 'if', at(3));

    r = add(r, 'say', at(0, { parent: 'if', key: 'then' }));
    r = withNeeds(r, ['legs', 'camera', 'speaker']);

    const compiled = compileRoutine(r);

    expect(r.watchers.map((w) => w.id)).toEqual(['person']);
    expect([...r.requires].sort()).toEqual(['camera', 'legs', 'speaker']);
    expect(compiled.errors ?? []).toEqual([]);
  });

  it('round-trips a hand-built Routine through the flow', () => {
    const r = add(built(), 'turn', at(1));

    expect(flowToRoutine(routineToFlow(r))).toEqual(r);
  });

  it('compiles a hand-built Routine and passes every generated scenario', async () => {
    const compiled = compileRoutine(built());

    if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));

    expect(compiled.plan.ops.find((o) => o.node === 'drive')?.move).toEqual({ distance: 1, speed: 0.2, heading: 0 });

    for (const scenario of generateScenarios(compiled.plan)) {
      const result = await runScenario(compiled.plan, scenario);

      expect(result.failures, scenario.covers).toEqual([]);
    }
  });

  it('refuses a move with no distance or turn', () => {
    const edit: RoutineEdit = { op: 'update', id: 'drive', patch: { move: { speed: 0.3 } } };
    const r = applyEdit(built(), edit);

    expect(validateRoutine(r).ok).toBe(false);
  });
});
