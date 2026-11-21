import { afterEach, expect, it, vi } from 'vitest';
import { editWithOperands } from '../booleans/operands';
import { specToPart } from '../agent/agentScene';
import { DEFAULT_PROJECT, type ScenePart } from '../types/robotics';
import { applyAgentOps, type AgentOpsContext } from './applyAgentOps';
import { docFromParts, pushHistory, trackedOf, travelProject } from './docHistory';

const gate = vi.hoisted(() => ({ pending: Promise.resolve() }));

vi.mock('../agent/sheetProfiles', async (original) => ({
  ...(await original<typeof import('../agent/sheetProfiles')>()),
  incomingSheetProfile: async () => {
    await gate.pending;

    return undefined;
  },
}));

afterEach(() => {
  gate.pending = Promise.resolve();
});

function fixture() {
  const manual = specToPart({ id: 'manual', shape: 'box' });
  const existing = specToPart({ id: 'existing', shape: 'box' });
  let doc = docFromParts([manual, existing]);
  let commits = 0;
  const controller = new AbortController();
  const touched: string[] = [];
  const ctx: AgentOpsContext = {
    current: () => doc.parts,
    commitParts: (edit) => {
      commits++;
      doc = pushHistory(doc, editWithOperands(doc.parts, edit), trackedOf(DEFAULT_PROJECT));
    },
    viewport: () => null,
    setCursor: () => {},
    setAction: () => {},
    isFollowing: () => false,
    guard: () => null,
    touch: (id) => touched.push(id),
    signal: controller.signal,
  };
  const edit = (part: ScenePart) => {
    doc = pushHistory(
      doc,
      doc.parts.map((p) => (p.id === part.id ? part : p)),
      trackedOf(DEFAULT_PROJECT),
    );
  };
  const travel = (direction: 'undo' | 'redo') => {
    const moved = travelProject(doc, DEFAULT_PROJECT, { direction });

    if (moved) doc = moved.doc;
  };

  return { ctx, manual, existing, controller, edit, travel, doc: () => doc, commits: () => commits, touched };
}

function hold() {
  let release = () => {};

  gate.pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  return release;
}

it('publishes an atomic transaction after concurrent user editing and preserves undo and redo order', async () => {
  const scene = fixture();
  const release = hold();
  const pending = applyAgentOps(
    [
      { op: 'add', part: { id: 'added', shape: 'box' } },
      { op: 'update', part: { id: 'existing', name: 'Agent edit' } },
    ],
    scene.ctx,
  );
  const user = { ...scene.manual, name: 'Manual edit' };

  scene.edit(user);
  expect(scene.doc().parts).toEqual([user, scene.existing]);
  release();
  await pending;
  expect(scene.commits()).toBe(1);
  expect(scene.doc().parts.map((p) => p.name)).toEqual(['Manual edit', 'Agent edit', 'added']);
  expect(scene.doc().parts[0]).toBe(user);
  scene.travel('undo');
  expect(scene.doc().parts).toEqual([user, scene.existing]);
  scene.travel('undo');
  expect(scene.doc().parts).toEqual([scene.manual, scene.existing]);
  scene.travel('redo');
  scene.travel('redo');
  expect(scene.doc().parts.map((p) => p.name)).toEqual(['Manual edit', 'Agent edit', 'added']);
});

it('rejects stopped preparation without publishing a prefix or claiming edits', async () => {
  const scene = fixture();
  const release = hold();
  const pending = applyAgentOps(
    [
      { op: 'update', part: { id: 'existing', name: 'Pending edit' } },
      { op: 'add', part: { id: 'added', shape: 'box' } },
    ],
    scene.ctx,
  );

  scene.controller.abort();
  release();
  await expect(pending).rejects.toThrow();
  expect(scene.doc().parts).toEqual([scene.manual, scene.existing]);
  expect(scene.doc().past).toEqual([]);
  expect(scene.commits()).toBe(0);
  expect(scene.touched).toEqual([]);
});

it('refuses an overlapping user edit while retaining the user history', async () => {
  const scene = fixture();
  const release = hold();
  const pending = applyAgentOps(
    [
      { op: 'update', part: { id: 'existing', name: 'Agent edit' } },
      { op: 'add', part: { id: 'added', shape: 'box' } },
    ],
    scene.ctx,
  );
  const user = { ...scene.existing, name: 'User owns this edit' };

  scene.edit(user);
  release();
  await expect(pending).rejects.toThrow();
  expect(scene.doc().parts).toEqual([scene.manual, user]);
  expect(scene.commits()).toBe(0);
  expect(scene.touched).toEqual([]);
  scene.travel('undo');
  expect(scene.doc().parts).toEqual([scene.manual, scene.existing]);
});

it('resolves later operations against parts added earlier in the same atomic transaction', async () => {
  const scene = fixture();

  await applyAgentOps(
    [
      { op: 'add', part: { id: 'new-bracket', shape: 'box', size: [20, 20, 10] } },
      { op: 'update', part: { id: 'new-bracket', name: 'Sized bracket', size: [40, 30, 12] } },
    ],
    scene.ctx,
  );

  expect(scene.commits()).toBe(1);
  expect(scene.doc().parts.find((part) => part.id === 'new-bracket')).toMatchObject({
    name: 'Sized bracket',
    dimensions: { width: 40, depth: 30, height: 12 },
  });
  scene.travel('undo');
  expect(scene.doc().parts).toEqual([scene.manual, scene.existing]);
});

it('does not record accepted edits when document validation refuses the transaction', async () => {
  const scene = fixture();

  await expect(
    applyAgentOps([{ op: 'add', part: { id: 'refused', shape: 'box' } }], { ...scene.ctx, commitParts: () => {} }),
  ).rejects.toThrow();
  expect(scene.doc().parts).toEqual([scene.manual, scene.existing]);
  expect(scene.touched).toEqual([]);
});

it('refuses prepared edits after the document generation changes', async () => {
  const scene = fixture();
  const release = hold();
  let current = true;
  const pending = applyAgentOps([{ op: 'update', part: { id: 'existing', name: 'Old scene edit' } }], {
    ...scene.ctx,
    isCurrent: () => current,
  });

  current = false;
  release();
  await expect(pending).rejects.toThrow();
  expect(scene.doc().parts).toEqual([scene.manual, scene.existing]);
  expect(scene.commits()).toBe(0);
  expect(scene.touched).toEqual([]);
});
