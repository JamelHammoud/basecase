import { describe, expect, it } from 'vitest';
import { versionOperation, compareVersions } from './versionOperations';
import { captureVersion, emptyVersionGraph, readVersionGraph, restoreVersion } from './sceneVersions';
import { versionPart as part, versionScene as scene, versionJoint as joint } from './sceneVersions.fixtures';
import { pushHistory, trackedOf, travelProject } from './docHistory';
import { completedEdits } from './runEdits';
import { snapshotMatches } from './versionMerge';
import { sharedScene } from '../utils/sceneFile';

const capture = async (design = scene([part('body')]), history?: string) =>
  versionOperation({ action: 'capture', scene: JSON.stringify(design), history, label: 'Baseline' });

async function alternatives() {
  const base = scene([part('body'), part('leg')]);
  const root = await capture(base);
  const fork = await versionOperation({ action: 'branch', history: root.history, id: root.head!, sceneId: 'robot' });
  const ours = scene([part('body'), part('leg', 20)]);
  const theirs = scene([part('body'), part('leg'), part('camera')], [joint('camera-joint', 'body', 'camera')]);
  const a = await capture(ours, root.history);
  const b = await capture(theirs, fork.history);

  return { base, ours, theirs, a, b, fork };
}

describe('durable exploration lifecycle', () => {
  it('captures overlapping lanes and retains an interrupted design with its baseline', async () => {
    const base = scene([part('body')]);
    const a = await versionOperation({ action: 'begin', scene: JSON.stringify(base), run: 'lane-a' });
    const b = await versionOperation({
      action: 'begin',
      scene: JSON.stringify(base),
      history: a.history,
      run: 'lane-b',
    });
    const changed = scene([part('body'), part('camera')]);
    const done = await versionOperation({
      action: 'finish',
      scene: JSON.stringify(changed),
      history: b.history,
      run: 'lane-a',
    });
    const interrupted = await versionOperation({
      action: 'finish',
      scene: JSON.stringify(changed),
      history: done.history,
      run: 'lane-b',
    });
    const reopened = readVersionGraph(interrupted.history);

    expect(Object.keys(reopened.activeRuns!)).toEqual([]);
    expect(Object.keys(reopened.completedRuns!)).toEqual(['lane-a', 'lane-b']);
    expect(restoreVersion(reopened, reopened.completedRuns!['lane-a'].before)).toEqual(base);
    expect(restoreVersion(reopened).parts).toHaveLength(2);
  });

  it('restores skeleton edits and retains the current design for later recovery', async () => {
    const base = scene([part('body')]);
    const skeleton = {
      frame: 'z-up' as const,
      joints: [
        { id: 'hip', origin: [0, 0, 0] as [number, number, number], axis: [0, 0, 1] as [number, number, number] },
      ],
      pairs: [],
    };
    const original = await capture({ ...base, project: { ...base.project, skeleton } });
    const changed = { ...base, project: { ...base.project, skeleton: { ...skeleton, massG: 120 } } };

    expect(snapshotMatches(base, base)).toBe(true);
    expect(snapshotMatches(changed, base)).toBe(false);

    const restored = await versionOperation({
      action: 'restore',
      history: original.history,
      id: original.head!,
      scene: JSON.stringify(changed),
    });
    const graph = readVersionGraph(restored.history);

    expect(restored.scene?.project.skeleton).toEqual(skeleton);
    expect(restored.rows.some((row) => restoreVersion(graph, row.id).project.skeleton?.massG === 120)).toBe(true);
  });

  it('retains complete scene project settings and annotations through undo and redo after restore', () => {
    const before = scene([part('arm')]);
    const after = { ...before, parts: [part('arm', 20)], project: { ...before.project, infillPct: 50 } };
    const text = { globalGoal: 'Carry a camera', annotations: before.annotations };
    const doc = pushHistory({ parts: before.parts, past: [], future: [], base: null }, after.parts, {
      ...trackedOf(before.project),
      project: before.project,
      scene: text,
    });
    const undone = travelProject(doc, after.project, {
      direction: 'undo',
      scene: { ...text, globalGoal: 'Carry a sensor' },
    })!;
    const redone = travelProject(undone.doc, undone.project, { direction: 'redo', scene: text })!;

    expect(undone.project.infillPct).toBe(before.project.infillPct);
    expect(undone.to.scene).toEqual(text);
    expect(redone.project.infillPct).toBe(50);
    expect(redone.to.scene?.globalGoal).toBe('Carry a sensor');
    expect(redone.doc.parts).toEqual(after.parts);
  });

  it('keeps histories local when exporting a portable snapshot', () => {
    const baseline = scene([part('body')]);
    const graph = captureVersion(emptyVersionGraph(), baseline, { label: 'Portable', at: '2026-11-16' });
    const record = { ...baseline, name: 'Robot', history: JSON.stringify(graph) };

    expect(sharedScene(record)).not.toHaveProperty('history');
    expect(sharedScene(record).parts).toEqual(baseline.parts);
  });
});

describe('selective version graph merge', () => {
  it('keeps source and target histories and uses a shared branch base', async () => {
    const { ours, theirs, a, b, fork } = await alternatives();
    const merged = await compareVersions({
      history: a.history,
      otherHistory: b.history,
      ours: JSON.stringify(ours),
      theirs: JSON.stringify(theirs),
      selected: ['part:camera'],
      apply: true,
    });

    expect(fork.origin?.sceneId).toBe('robot');
    expect(merged.view?.scene?.parts.find((p) => p.id === 'leg')?.position[0]).toBe(20);
    expect(merged.view?.scene?.project.joints).toEqual(theirs.project.joints);
    expect(merged.view?.rows.some((row) => row.id === a.head)).toBe(true);
    expect(merged.view?.rows.some((row) => row.id === b.head)).toBe(true);
    expect(restoreVersion(readVersionGraph(b.history))).toEqual(theirs);
  });

  it('does not consume unselected changes and accepts later edits to a previously merged part', async () => {
    const { ours, theirs, a, b } = await alternatives();
    const first = await compareVersions({
      history: a.history,
      otherHistory: b.history,
      ours: JSON.stringify(ours),
      theirs: JSON.stringify(theirs),
      selected: ['part:camera'],
      apply: true,
    });
    const changed = { ...theirs, parts: theirs.parts.map((p) => (p.id === 'camera' ? part('camera', 8) : p)) };
    const next = await capture(changed, b.history);
    const second = await compareVersions({
      history: first.view!.history,
      otherHistory: next.history,
      ours: JSON.stringify(first.view!.scene),
      theirs: JSON.stringify(changed),
      selected: ['part:camera'],
      apply: true,
    });

    expect(second.merge?.conflicts).toEqual([]);
    expect(second.view?.scene?.parts.find((p) => p.id === 'camera')?.position[0]).toBe(8);
    expect(second.view?.scene?.parts.find((p) => p.id === 'leg')?.position[0]).toBe(20);
  });

  it('refuses unrelated histories and preserves each working design', async () => {
    const one = scene([part('a')]);
    const two = scene([part('b')]);
    const a = await capture(one);
    const b = await capture(two);
    const comparison = await compareVersions({
      history: a.history,
      otherHistory: b.history,
      ours: JSON.stringify(one),
      theirs: JSON.stringify(two),
      selected: ['part:b'],
      apply: true,
    });

    expect(comparison.merge).toBeNull();
    expect(comparison.view).toBeNull();
  });
});

it('branches a sheet chassis and restores unavailable artifact references without relabeling evidence', async () => {
  const design = scene([{ ...part('chassis'), sheet: { material: 'aluminum-6061', thicknessMm: 3 } }]);
  const policy = {
    id: 'policy-unavailable',
    name: 'Walk',
    task: 'walk' as const,
    robot: 'rover',
    robotName: 'Rover',
    command: [0, 0, 0] as [number, number, number],
    trainedSteps: 100,
    createdAt: '2026-11-16',
    fingerprint: 'original-design',
  };
  const baseline = { ...design, project: { ...design.project, policies: [policy] } };
  const root = await capture(baseline);
  const branch = await versionOperation({
    action: 'branch',
    history: root.history,
    id: root.head!,
    sceneId: 'chassis',
  });
  const restored = await versionOperation({
    action: 'restore',
    history: root.history,
    id: root.head!,
    scene: JSON.stringify(design),
  });

  expect(branch.origin).toEqual({ sceneId: 'chassis', versionId: root.head });
  expect(branch.scene?.parts[0].sheet).toEqual(design.parts[0].sheet);
  expect(restored.scene?.project.policies).toEqual([policy]);
});

it('keeps an unselected incoming leg edit available for a later selective merge', async () => {
  const base = scene([part('body'), part('leg')]);
  const root = await capture(base);
  const incoming = scene([part('body'), part('leg', 40), part('camera')]);
  const branch = await capture(incoming, root.history);
  const first = await compareVersions({
    history: root.history,
    otherHistory: branch.history,
    ours: JSON.stringify(base),
    theirs: JSON.stringify(incoming),
    selected: ['part:camera'],
    apply: true,
  });
  const second = await compareVersions({
    history: first.view!.history,
    otherHistory: branch.history,
    ours: JSON.stringify(first.view!.scene),
    theirs: JSON.stringify(incoming),
    selected: ['part:leg'],
    apply: true,
  });

  expect(first.view?.scene?.parts.find((p) => p.id === 'leg')?.position[0]).toBe(0);
  expect(second.view?.scene?.parts.find((p) => p.id === 'leg')?.position[0]).toBe(40);
});

it('undoes and redoes a merged mount with its joint through ordinary project history', async () => {
  const { ours, theirs, a, b } = await alternatives();
  const merged = await compareVersions({
    history: a.history,
    otherHistory: b.history,
    ours: JSON.stringify(ours),
    theirs: JSON.stringify(theirs),
    selected: ['part:camera'],
    apply: true,
  });
  const design = merged.view!.scene!;
  const doc = pushHistory({ parts: ours.parts, past: [], future: [], base: null }, design.parts, {
    ...trackedOf(ours.project),
    project: ours.project,
  });
  const undo = travelProject(doc, design.project, { direction: 'undo' })!;
  const redo = travelProject(undo.doc, undo.project, { direction: 'redo' })!;

  expect(undo.doc.parts).toEqual(ours.parts);
  expect(undo.project.joints).toEqual(ours.project.joints);
  expect(redo.doc.parts).toEqual(design.parts);
  expect(redo.project.joints).toEqual(design.project.joints);
});

it('reopens completed ownership by chat and reverts only that lane after another lane edits', async () => {
  const initial = scene([part('arm'), part('camera')]);
  const begin = await versionOperation({
    action: 'begin',
    scene: JSON.stringify(initial),
    run: 'old-workspace_lane-a',
    chatId: 'chat-a',
  });
  const changed = scene([part('arm', 20), part('camera', 40)]);
  const done = await versionOperation({
    action: 'finish',
    history: begin.history,
    scene: JSON.stringify(changed),
    run: 'old-workspace_lane-a',
    selected: ['arm'],
  });
  const reopened = await versionOperation({ action: 'view', history: done.history });
  const owned = completedEdits(reopened.completedRuns, 'new-workspace_lane-a', 'chat-a')!;
  const reverted = await versionOperation({
    action: 'revert',
    history: reopened.history,
    scene: JSON.stringify(changed),
    run: owned.key,
    selected: owned.parts,
  });

  expect(owned.parts).toEqual(['arm']);
  expect(reverted.completedRuns).not.toHaveProperty(owned.key);
  expect(completedEdits(reopened.completedRuns, 'new-workspace_lane-a', 'chat-b')).toBeNull();
  expect(reverted.scene?.parts.find((p) => p.id === 'arm')?.position[0]).toBe(0);
  expect(reverted.scene?.parts.find((p) => p.id === 'camera')?.position[0]).toBe(40);
});
