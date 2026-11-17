import { describe, expect, it } from 'vitest';
import { buildBom } from '../utils/bom';
import { electricalScenes } from './electricalFixtures';
import { defineBoard } from './boardDefinition';

describe('board demand in the ordinary BOM', () => {
  it.each(electricalScenes())('counts new headers once without duplicating existing modules for $name', ({ scene }) => {
    const { board, part } = defineBoard(scene, 'board');
    const input = { parts: [...scene.parts, part], project: { ...scene.project, electronicsBoard: board } };
    const bom = buildBom({ ...input, measures: {}, purchases: {} });
    const expected = scene.parts.filter((item) => item.componentId === 'dynamixel-xl330-m288').length;
    const headers = bom.lines.find((line) => line.key === 'component:jst-b3b-eh-a');

    expect(headers?.qty ?? 0).toBe(expected);

    for (const id of ['pololu-d36v50f5', 'pololu-d36v50f6', 'pololu-d36v50f12']) {
      expect(bom.lines.find((line) => line.key === `component:${id}`)?.qty ?? 0).toBe(
        scene.parts.filter((item) => item.componentId === id).length,
      );
    }
  });

  it('uses the same purchase identity and on-hand split as an ordinary catalog product', () => {
    const scene = electricalScenes().find((item) => item.name === 'dual-bus-arm')!.scene;
    const { board, part } = defineBoard(scene, 'board');
    const bom = buildBom({
      parts: [...scene.parts, part],
      project: { ...scene.project, electronicsBoard: board },
      measures: {},
      purchases: { 'component:jst-b3b-eh-a': { onHand: 1 } },
    });
    const header = bom.lines.find((line) => line.key === 'component:jst-b3b-eh-a')!;

    expect(header.qty).toBe(2);
    expect(header.toBuy).toBe(1);
    expect(header.identity?.mpn).toBe('B3B-EH-A');
    expect(header.partIds).toEqual(['board']);
  });
});
