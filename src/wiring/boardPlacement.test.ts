import { describe, expect, it } from 'vitest';
import { box } from '../sim/fixtures/parts';
import { electricalProjection } from './electrical';
import { electricalScenes } from './electricalFixtures';
import { component, sceneOf } from './fixtures';
import { projectBoard } from './boardProjection';
import { placeBoard, timedBoardPlacement } from './boardPlacement';
import type { BoardPlacement, ElectronicsBoard } from './boardTypes';
import { BOARD_PRODUCTS } from './boardProducts';
import { decodeSceneFile, encodeSceneFile, sharedScene } from '../utils/sceneFile';

function board(placements: BoardPlacement[] = []): ElectronicsBoard {
  return {
    schema: 1,
    partId: 'board',
    outline: 'rectangle',
    side: 'top',
    heightMm: { top: 30, bottom: 5 },
    edgeClearanceMm: 1,
    holes: [{ id: 'mount', position: [-20, -15], diameterMm: 3.2, keepoutMm: 2 }],
    keepouts: [],
    placements,
  };
}

function placement(id: string, partId = 'xl'): BoardPlacement {
  return {
    id,
    productId: 'jst-b3b-eh-a',
    position: [0, 0],
    rotation: 0,
    locked: false,
    bindings: ['1', '2', '3'].map((pin) => ({ pad: pin, partId, port: 'bus-in', pin })),
  };
}

function fixture(placements = [placement('servo')]) {
  const part = box('board', [100, 20, 40], [60, 1.6, 40], 5);
  const scene = sceneOf([part, component('xl', 'dynamixel-xl330-m288')], []);

  return { ...scene, project: { ...scene.project, electronicsBoard: board(placements) } };
}

const codes = (scene: ReturnType<typeof fixture>) => projectBoard(scene).requirements.map((item) => item.code);

describe('board placement contract', () => {
  it('retains a bounded-search refusal in the saved board until manual placement clears it', () => {
    const scene = fixture();
    const result = placeBoard(scene, { maxCandidates: 0 });
    const input = { ...scene, project: { ...scene.project, electronicsBoard: result.board } };

    expect(projectBoard(input).requirements.some((item) => item.code === 'board-fit')).toBe(true);
    input.project.electronicsBoard.placements[0].unplaced = false;
    expect(projectBoard(input).requirements.some((item) => item.code === 'board-fit')).toBe(false);
  });

  it('adds supported new endpoints when arranging without replacing locked or unsupported saved records', () => {
    const scene = fixture([{ ...placement('existing'), locked: true }]);
    const original = structuredClone(scene.project.electronicsBoard.placements[0]);

    scene.parts.push(component('new-servo', 'dynamixel-xl330-m288'));
    scene.project.electronicsBoard.placements.push({ ...placement('unknown', 'missing'), productId: 'unproven' });

    const result = timedBoardPlacement(scene);

    expect(result.board.placements).toHaveLength(3);
    expect(result.board.placements.find((item) => item.id === 'existing')).toEqual(original);
    expect(result.board.placements.some((item) => item.productId === 'unproven')).toBe(true);
    expect(result.terminals.some((item) => item.placementId === 'connector_new-servo')).toBe(true);
  });

  it.each(electricalScenes())('retains every earlier electrical requirement for $name', ({ scene }) => {
    const earlier = electricalProjection(scene);
    const input = {
      ...scene,
      parts: [...scene.parts, box('board', [0, 0, 0], [60, 1.6, 40], 5)],
      project: { ...scene.project, electronicsBoard: board() },
    };
    const result = projectBoard(input);

    expect(result.electrical.requirements).toEqual(earlier.requirements);
    expect(result.electrical.nets).toEqual(earlier.nets);
    expect(result.requirements.some((item) => item.code === 'board-unmapped')).toBe(true);
  });

  it('binds exact product pads to existing nets without changing off-board endpoints', () => {
    const scene = fixture();
    const before = structuredClone(scene);
    const result = projectBoard(scene);

    expect(result.terminals).toHaveLength(3);
    expect(result.terminals.map((terminal) => terminal.pad)).toEqual(['1', '2', '3']);
    expect(result.terminals.map((terminal) => terminal.net)).toEqual(
      ['ground', 'positive', 'data'].map((fn) => result.electrical.nets.find((net) => net.function === fn)!.name),
    );
    expect(scene).toEqual(before);
    expect(result.requirements.some((item) => item.code === 'board-unrouted')).toBe(true);
  });

  it.each(['reversed', 'variant', 'missing', 'duplicate'] as const)('refuses %s pad evidence', (fault) => {
    const scene = fixture();
    const item = scene.project.electronicsBoard.placements[0];

    if (fault === 'reversed') [item.bindings[0].pin, item.bindings[2].pin] = ['3', '1'];

    if (fault === 'variant') scene.parts[1].componentVariant = 'unverified';

    if (fault === 'missing') item.productId = 'unknown';

    if (fault === 'duplicate') item.bindings[1].pad = '1';

    const result = projectBoard(scene);

    expect(result.terminals).toEqual([]);
    expect(result.requirements.some((item) => item.code === 'board-mapping')).toBe(true);
  });

  it('never treats a family or pin count as a mating identity', () => {
    const scene = fixture();

    scene.parts[1] = component('xl', 'feetech-sts3215', 'c001');
    expect(codes(scene)).toContain('board-mapping');
    expect(projectBoard(scene).terminals).toEqual([]);
  });

  it('rejects mappings assembled from different module endpoints instead of bridging their domains', () => {
    const scene = fixture();

    scene.parts.push(component('other', 'dynamixel-xl330-m288'));
    scene.project.electronicsBoard.placements[0].bindings[1].partId = 'other';
    expect(codes(scene)).toContain('board-mapping');
    expect(projectBoard(scene).terminals).toEqual([]);
  });

  it('keeps board references stable when an earlier off-board reference is inserted', () => {
    const scene = fixture();
    const original = projectBoard(scene).terminals.map((terminal) => terminal.reference);

    scene.parts.push(component('aaa', 'raspberry-pi-5'));
    expect(projectBoard(scene).terminals.map((terminal) => terminal.reference)).toEqual(original);
  });

  it.each(['hole', 'outline', 'height', 'access', 'overlap'] as const)('refuses a %s conflict', (fault) => {
    const scene = fixture();
    const definition = scene.project.electronicsBoard;

    if (fault === 'hole') definition.holes[0].position = [0, 0];

    if (fault === 'outline') scene.parts[0].dimensions.width = 5;

    if (fault === 'height') definition.heightMm.top = 1;

    if (fault === 'access') definition.keepouts = [{ id: 'lid', min: [-5, -5], max: [10, 10] }];

    if (fault === 'overlap') definition.placements.push(placement('other'));

    expect(codes(scene)).toContain(`board-${fault}`);
  });

  it('places deterministically around holes and locked components without mutating inputs', () => {
    const scene = fixture([placement('b'), { ...placement('a'), locked: true }]);
    const before = structuredClone(scene);
    const first = placeBoard(scene);
    const second = placeBoard(scene);

    expect(first).toEqual(second);
    expect(first.board.placements.find((item) => item.id === 'a')).toEqual(
      before.project.electronicsBoard.placements[1],
    );
    expect(first.requirements.filter((item) => ['board-overlap', 'board-hole'].includes(item.code))).toEqual([]);
    expect(scene).toEqual(before);
  });

  it('bounds infeasible placement without changing board size, identity or endpoint count', () => {
    const scene = fixture([placement('a'), placement('b')]);

    scene.parts[0].dimensions = { width: 6, depth: 6, height: 1.6 };

    const before = structuredClone(scene);
    const result = placeBoard(scene, { maxCandidates: 12 });

    expect(result.attempts).toBeLessThanOrEqual(12);
    expect(result.requirements.some((item) => item.code === 'board-fit')).toBe(true);
    expect(result.board.placements).toHaveLength(2);
    expect(scene).toEqual(before);
  });

  it('preserves identities and locked local placement through ordinary scene files', async () => {
    const scene = fixture([{ ...placement('servo'), locked: true }]);
    const original = projectBoard(scene);
    const file = await encodeSceneFile(sharedScene({ ...scene, name: 'Board', globalGoal: '', annotations: [] }));
    const reopened = await decodeSceneFile(file);
    const after = projectBoard({ parts: reopened.parts, project: reopened.project! });

    expect(after).toEqual(original);
    expect(BOARD_PRODUCTS[0].source).toBe('https://www.jst.com/wp-content/uploads/2025/06/eEH.pdf');
  });
});
