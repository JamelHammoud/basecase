import { expect, it } from 'vitest';
import { completedEdits } from './runEdits';
import { compareVersions, versionOperation } from './versionOperations';
import { readVersionGraph, restoreVersion } from './sceneVersions';
import { versionPart, versionScene } from './sceneVersions.fixtures';

const scene = (x: number) => JSON.stringify(versionScene([versionPart('arm', x)]));

async function run(options: { history?: string; chatId: string; before: number; after: number }) {
  const begun = await versionOperation({
    action: 'begin',
    history: options.history,
    scene: scene(options.before),
    run: 'workspace',
    chatId: options.chatId,
  });

  return versionOperation({
    action: 'finish',
    history: begun.history,
    scene: scene(options.after),
    run: 'workspace',
    selected: ['arm'],
  });
}

it('keeps Revert Changes bound to the latest run even when that run changed nothing', async () => {
  const edited = await run({ chatId: 'chat-a', before: 0, after: 20 });
  const unchanged = await run({ history: edited.history, chatId: 'chat-a', before: 20, after: 20 });
  const reopened = await versionOperation({ action: 'view', history: unchanged.history });

  expect(completedEdits(edited.completedRuns, 'workspace', 'chat-a')?.parts).toEqual(['arm']);
  expect(completedEdits(reopened.completedRuns, 'workspace', 'chat-a')?.parts).toEqual([]);
  expect(completedEdits(reopened.completedRuns, 'reopened-workspace', 'chat-a')?.parts).toEqual([]);
  expect(restoreVersion(readVersionGraph(reopened.history)).parts[0].position[0]).toBe(20);
});

it('retains each chat’s last completed ownership when another chat reuses its lane', async () => {
  const first = await run({ chatId: 'chat-a', before: 0, after: 20 });
  const second = await run({ history: first.history, chatId: 'chat-b', before: 20, after: 40 });
  const reopened = await versionOperation({ action: 'view', history: second.history });
  const a = completedEdits(reopened.completedRuns, 'new-workspace', 'chat-a')!;
  const b = completedEdits(reopened.completedRuns, 'new-workspace', 'chat-b')!;
  const graph = readVersionGraph(reopened.history);

  expect(a.parts).toEqual(['arm']);
  expect(b.parts).toEqual(['arm']);
  expect(a.key).not.toBe(b.key);
  expect(restoreVersion(graph, graph.completedRuns![a.key].before).parts[0].position[0]).toBe(0);
  expect(restoreVersion(graph, graph.completedRuns![b.key].before).parts[0].position[0]).toBe(20);
});

it('consumes only the latest reply’s revert without exposing ownership from an older reply', async () => {
  const first = await run({ chatId: 'chat-a', before: 0, after: 20 });
  const second = await run({ history: first.history, chatId: 'chat-a', before: 20, after: 40 });
  const owned = completedEdits(second.completedRuns, 'workspace', 'chat-a')!;
  const reverted = await versionOperation({
    action: 'revert',
    history: second.history,
    scene: scene(40),
    run: owned.key,
    selected: owned.parts,
  });

  expect(reverted.scene?.parts[0].position[0]).toBe(20);
  expect(completedEdits(reverted.completedRuns, 'workspace', 'chat-a')?.parts).toEqual([]);
  expect(Object.values(reverted.completedRuns).some((record) => record.parts?.includes('arm'))).toBe(true);
});

it('refuses a restore or merge queued behind a newly started agent baseline', async () => {
  const begun = await versionOperation({ action: 'begin', scene: scene(0), run: 'workspace', chatId: 'chat-a' });

  await expect(
    versionOperation({ action: 'restore', history: begun.history, scene: scene(20), id: begun.head! }),
  ).rejects.toThrow('Stop the agent');
  await expect(
    compareVersions({
      history: begun.history,
      otherHistory: begun.history,
      ours: scene(20),
      theirs: scene(0),
      selected: ['part:arm'],
      apply: true,
    }),
  ).rejects.toThrow('Stop the agent');
  expect(readVersionGraph(begun.history).activeRuns).toEqual({ workspace: begun.head });
});

it('restores the state before a lane first touched each part, preserving edits made after its run baseline', async () => {
  const initial = versionScene([versionPart('arm', 0), versionPart('replaced', 0)]);
  const begun = await versionOperation({
    action: 'begin',
    scene: JSON.stringify(initial),
    run: 'workspace',
    chatId: 'chat-a',
  });
  const originals = {
    arm: versionPart('arm', 20),
    replaced: null,
    camera: versionPart('camera', 30),
  };
  const edited = versionScene([versionPart('arm', 40), versionPart('replaced', 50), versionPart('body', 60)]);
  const finished = await versionOperation({
    action: 'finish',
    scene: JSON.stringify(edited),
    history: begun.history,
    run: 'workspace',
    selected: Object.keys(originals),
    originals,
  });
  const reopened = await versionOperation({ action: 'view', history: finished.history });
  const owned = completedEdits(reopened.completedRuns, 'new-workspace', 'chat-a')!;
  const reverted = await versionOperation({
    action: 'revert',
    scene: JSON.stringify(edited),
    history: reopened.history,
    run: owned.key,
    selected: owned.parts,
  });

  expect(reverted.scene?.parts).toEqual(
    expect.arrayContaining([versionPart('arm', 20), versionPart('camera', 30), versionPart('body', 60)]),
  );
  expect(reverted.scene?.parts).toHaveLength(3);
  expect(restoreVersion(readVersionGraph(reopened.history), begun.head!)).toEqual(initial);

  const damaged = readVersionGraph(reopened.history);

  damaged.completedRuns![owned.key].originals!.arm = '0'.repeat(64);

  await expect(versionOperation({ action: 'view', history: JSON.stringify(damaged) })).rejects.toThrow('damaged');
});

it('retains owned changes even when they return the design to its run baseline', async () => {
  const begun = await versionOperation({ action: 'begin', scene: scene(0), run: 'workspace', chatId: 'chat-a' });
  const finished = await versionOperation({
    action: 'finish',
    scene: scene(0),
    history: begun.history,
    run: 'workspace',
    selected: ['arm'],
    originals: { arm: versionPart('arm', 20) },
  });
  const owned = completedEdits(finished.completedRuns, 'workspace', 'chat-a')!;
  const reverted = await versionOperation({
    action: 'revert',
    scene: scene(0),
    history: finished.history,
    run: owned.key,
    selected: owned.parts,
  });

  expect(owned.parts).toEqual(['arm']);
  expect(finished.head).not.toBe(begun.head);
  expect(reverted.scene?.parts[0].position[0]).toBe(20);
});
