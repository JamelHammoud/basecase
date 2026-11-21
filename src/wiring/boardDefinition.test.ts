import { describe, expect, it } from 'vitest';
import { electricalScenes } from './electricalFixtures';
import { defineBoard } from './boardDefinition';
import { projectBoard } from './boardProjection';
import { component, sceneOf } from './fixtures';
import { componentSize } from '../data/components';
import { electricalProjection } from './electrical';
import { endOf, portOf, type Netlist } from './connectors';

describe('define an electronics board', () => {
  it('keeps repeated regulators and isolated output domains through bounded placement', () => {
    const parts = Array.from({ length: 16 }, (_, i) => {
      const componentId = i % 2 ? 'pololu-d36v50f5' : 'pololu-d36v50f6';

      return { ...component(`regulator${i}`, componentId), dimensions: componentSize(componentId) };
    });
    const packs = parts.map((_, i) => component(`pack${i}`, 'ovonic-3s-2200-50c'));
    const loads = parts.map((_, i) => component(`load${i}`, 'feetech-sts3215', 'c001'));
    const wiring: Netlist = {
      buses: [],
      unmatched: [],
      power: {
        source: null,
        battery: true,
        nets: parts.flatMap((part, i) => [
          { from: endOf(packs[i], portOf(packs[i], 'power-out')!), to: endOf(part, portOf(part, 'power-in')!) },
          { from: endOf(part, portOf(part, 'power-out')!), to: endOf(loads[i], portOf(loads[i], 'bus-in')!) },
        ]),
      },
    };
    const scene = { ...sceneOf([...parts, ...packs, ...loads], []), wiring };
    const earlier = electricalProjection(scene);
    const { part, board, hardwareParts } = defineBoard(scene, 'board');
    const projected = projectBoard({
      ...scene,
      parts: [...scene.parts, part, ...hardwareParts],
      project: { ...scene.project, electronicsBoard: board },
    });
    const outputs = board.placements.map(
      (placement) =>
        projected.terminals.find((terminal) => terminal.placementId === placement.id && terminal.pad === 'VOUT_1')!.net,
    );

    expect(board.placements).toHaveLength(16);
    expect(projected.terminals).toHaveLength(128);
    expect(new Set(outputs).size).toBe(16);
    expect(projected.electrical.nets).toEqual(earlier.nets);
    expect(projected.requirements.some((item) => item.code === 'board-outline' || item.code === 'board-overlap')).toBe(
      true,
    );
  });

  it.each(electricalScenes())(
    'preserves electrical requirements and supported placement identities for $name',
    ({ scene }) => {
      const before = structuredClone(scene);
      const result = defineBoard(scene, 'board');
      const input = {
        parts: [...scene.parts, result.part],
        project: { ...scene.project, electronicsBoard: result.board },
      };
      const projected = projectBoard(input);

      expect(scene).toEqual(before);
      expect(result.board.holes).toHaveLength(4);
      expect(result.part.dimensions).toEqual({ width: 100, depth: 80, height: 1.6 });
      expect(projected.electrical.requirements.length).toBeGreaterThan(0);
      expect(projected.requirements.some((item) => item.code === 'board-unmapped')).toBe(true);
      expect(defineBoard(scene, 'board')).toEqual(result);
    },
  );

  it('places the rover regulator without adding a second purchased module or inventing servo footprints', () => {
    const scene = electricalScenes().find((entry) => entry.name === 'battery-rover')!.scene;
    const { part, board } = defineBoard(scene, 'board');
    const projected = projectBoard({
      parts: [...scene.parts, part],
      project: { ...scene.project, electronicsBoard: board },
    });

    expect(board.placements).toHaveLength(1);
    expect(board.placements[0].productId).toBe('pololu-d36v50f6');
    expect(projected.terminals).toHaveLength(8);
    expect(projected.requirements.filter((item) => item.code === 'board-mapping')).toEqual([]);
  });
});
