import { expect, it } from 'vitest';
import { taskUsage } from './usageTasks.mjs';

const session = (id, taskId, extra = {}) => ({
  id,
  taskId,
  task: id,
  state: 'completed',
  ok: true,
  provider: 'codex',
  usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 80 },
  durationMs: 50,
  ...extra,
});

it('partitions standalone, resumed, rebuilt, shared, abandoned and running work without duplication', () => {
  const pulls = [
    { number: 1, state: 'MERGED', body: 'Closes #10.' },
    { number: 2, state: 'CLOSED', body: '' },
    { number: 3, state: 'MERGED', body: 'Rebuilds #2.' },
    { number: 4, state: 'MERGED', body: 'Closes #11. Closes #12.' },
    { number: 5, state: 'CLOSED', body: '' },
  ];
  const records = [
    session('a', 'step:10', { worker: 'refine-2', taskKind: 'feature', ok: false }),
    session('b', 'step:10', { continued: true }),
    session('c', 'pull:2', { name: 'revise' }),
    session('d', 'pull:3', { name: 'review' }),
    session('e', 'pull:4'),
    session('f', 'pull:5'),
    session('g', 'work:pending'),
    session('h', 'step:13', { state: 'running', usage: null, durationMs: undefined }),
    session('i', null, { shared: true }),
    session('j', null),
  ];
  const result = taskUsage(records, pulls);

  expect(result.mergedTasks).toBe(2);
  expect(result.tasks.find((task) => task.task === 'step:10')).toMatchObject({ sessions: 2, failedAttempts: 1 });
  expect(result.mergedWork.sessions).toBe(4);
  expect(result.shared.sessions).toBe(2);
  expect(result.abandoned.sessions).toBe(1);
  expect(result.unfinished.sessions).toBe(1);
  expect(result.running).toMatchObject({ sessions: 1, tokens: null, milliseconds: null });
  expect(result.unattributed.sessions).toBe(1);
  expect(result.reconciliation).toMatchObject({ inputSessions: 10, accountedSessions: 10 });
});

it('does not infer a merge from a successful exit or unavailable history', () => {
  expect(taskUsage([session('a', 'pull:1')], null)).toMatchObject({
    mergedTasks: 0,
    linkageAvailable: false,
    unfinished: { sessions: 1 },
  });
});

it('keeps conflicting publication evidence ambiguous rather than choosing a task', () => {
  const result = taskUsage(
    [session('one', 'pull:1', { workId: 'work:conflict' })],
    [
      { number: 1, state: 'MERGED', body: '' },
      { number: 2, state: 'MERGED', body: '' },
    ],
    [{ number: 2, workId: 'work:conflict' }],
  );

  expect(result).toMatchObject({ mergedTasks: 0, ambiguous: { sessions: 1 }, reconciliation: { ambiguous: 1 } });
  expect(result.provenance[0].candidates).toEqual([1, 2]);
});

it('allocates explicit step work within a batch while leaving its review shared', () => {
  const result = taskUsage(
    [session('build-10', 'step:10'), session('build-11', 'step:11'), session('review', 'pull:1')],
    [{ number: 1, state: 'MERGED', body: 'Closes #10. Closes #11.' }],
  );

  expect(result).toMatchObject({ mergedTasks: 2, mergedWork: { sessions: 2 }, shared: { sessions: 1 } });
  expect(result.tasks.map((task) => task.sessions)).toEqual([1, 1]);
});

it('follows existing batch membership without pooling each member task into the batch', () => {
  const result = taskUsage(
    [session('feature', 'step:10'), session('refine', 'pull:21'), session('shared-review', 'pull:22')],
    [
      { number: 20, state: 'CLOSED', body: 'Closes #10.', title: 'Feature: Build it' },
      { number: 21, state: 'CLOSED', body: '', title: 'Refine: Refine it' },
      {
        number: 22,
        state: 'MERGED',
        title: 'Batch: Land both',
        mergedAt: '2026-11-16T01:00:00Z',
        body: '- #20 Feature: Build it\n- #21 Refine: Refine it',
      },
    ],
  );

  expect(result).toMatchObject({ mergedTasks: 2, mergedWork: { sessions: 2 }, shared: { sessions: 1 } });
  expect(result.tasks.map((task) => task.kind)).toEqual(['feature', 'refine']);
  expect(result.tasks[0]).toMatchObject({ task: 'step:10', pulls: [20, 22], mergedAt: '2026-11-16T01:00:00Z' });
  expect(result.sharedTasks[0]).toMatchObject({ task: 'batch:22', steps: [10], sessions: 1 });
});
