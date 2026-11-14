import { describe, expect, it } from 'vitest';
import { knockGame } from '../cases/fixtureGames';
import { applyEdits, newRoutine } from '../routines/edit';
import type { Routine } from '../routines/schema';
import { DEFAULT_PROJECT, type ProjectSettings, type ScenePart } from '../types/robotics';
import { routinesView, writeRoutines } from './caseLogicRoutines';
import { EMPTY_DOC, pushHistory, trackedOf, travelProject, type HistoryStep } from './docHistory';
import type { DocState } from './types';

interface Scene {
  doc: DocState;
  project: ProjectSettings;
}

const routine = newRoutine({ id: 'hand', name: 'Patrol', mover: 'wheels' });
const drive = applyEdits(routine, [
  {
    op: 'insert',
    at: { seq: { parent: 'start', key: 'onTimeout' }, index: 0 },
    step: {
      kind: 'do',
      id: 'drive',
      skill: 'walk',
      holds: [],
      move: { distance: 1 },
      timeoutMs: 10000,
      onTimeout: [],
      onFail: [],
    },
  },
]);
const farther = applyEdits(drive, [{ op: 'update', id: 'drive', patch: { move: { distance: 0.9 } } }]);

const commitRoutines = ({ doc, project }: Scene, list: Routine[]): Scene => ({
  doc: pushHistory(doc, doc.parts, { ...trackedOf(project), routines: routinesView(project) }),
  project: writeRoutines(project, list),
});

const commitParts = ({ doc, project }: Scene, parts: ScenePart[]): Scene => ({
  doc: pushHistory(doc, parts, trackedOf(project)),
  project,
});

function travel(scene: Scene, direction: HistoryStep['direction']): Scene {
  const moved = travelProject(scene.doc, scene.project, { direction });

  if (!moved) throw new Error(`Nothing to ${direction}`);

  return { doc: moved.doc, project: moved.project };
}

const distanceOf = (scene: Scene) => {
  const step = routinesView(scene.project)[0]?.base.onTimeout[0];

  return step?.kind === 'do' ? step.move?.distance : undefined;
};

describe('Routine edits in the scene’s history', () => {
  it('undoes and redoes adding a step and editing its field', () => {
    let scene: Scene = { doc: EMPTY_DOC, project: { ...DEFAULT_PROJECT } };

    scene = commitRoutines(scene, [routine]);
    scene = commitRoutines(scene, [drive]);
    scene = commitRoutines(scene, [farther]);
    expect(distanceOf(scene)).toBeCloseTo(0.9);
    expect(scene.doc.past).toHaveLength(3);

    scene = travel(scene, 'undo');
    expect(distanceOf(scene)).toBe(1);
    scene = travel(scene, 'undo');
    expect(routinesView(scene.project)[0].base.onTimeout).toEqual([]);
    scene = travel(scene, 'undo');
    expect(scene.project.routines).toBeUndefined();

    scene = travel(travel(travel(scene, 'redo'), 'redo'), 'redo');
    expect(distanceOf(scene)).toBeCloseTo(0.9);
  });

  it('leaves Routines alone when undoing a part edit after them', () => {
    const part = { id: 'p' } as ScenePart;
    let scene: Scene = commitRoutines({ doc: EMPTY_DOC, project: { ...DEFAULT_PROJECT } }, [drive]);

    scene = commitParts(scene, [part]);
    scene = travel(scene, 'undo');
    expect(scene.doc.parts).toEqual([]);
    expect(scene.project.routines).toEqual([drive]);
  });

  it('puts a Case’s logic back into its Case', () => {
    const kase = knockGame({ seconds: 5, target: 2 });
    const logic = kase.logic!;
    let scene: Scene = { doc: EMPTY_DOC, project: { ...DEFAULT_PROJECT, cases: [kase] } };

    scene = commitRoutines(scene, [{ ...logic, name: 'Points' }]);
    expect(scene.project.cases?.[0].logic?.name).toBe('Points');

    scene = travel(scene, 'undo');
    expect(scene.project.cases?.[0].logic).toEqual(logic);
    expect(scene.project.routines).toBeUndefined();
  });
});
