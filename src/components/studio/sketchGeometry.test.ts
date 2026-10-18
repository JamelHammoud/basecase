import { describe, expect, it } from 'vitest';
import { appendFreehandPoint, holeLoopAt, sketchDrawing, snapSketchPoint } from './sketchGeometry';

const output = { name: 'Plate', spanMm: 64, heightMm: 10, bevel: true, color: '#e4e4e7' };
const square: Array<[number, number]> = [
  [-0.2, -0.2],
  [0.2, -0.2],
  [0.2, 0.2],
];

describe('sketch geometry', () => {
  it('clamps to the board and snaps to the grid or fine steps', () => {
    expect(snapSketchPoint([0.6, -0.123], true)).toEqual([0.5, -0.1]);
    expect(snapSketchPoint([0.6, -0.123], false)).toEqual([0.48, -0.125]);
  });

  it('makes a 14-point hole around the click', () => {
    const loop = holeLoopAt([0.1, 0]);

    expect(loop).toHaveLength(14);
    expect(loop[0]).toEqual([0.165, 0]);
  });

  it('skips freehand points closer than the minimum step', () => {
    const start = appendFreehandPoint([], [0, 0]);

    expect(start).toEqual([[0, 0]]);
    expect(appendFreehandPoint(start, [0.01, 0])).toBe(start);
    expect(appendFreehandPoint(start, [0.1, 0])).toEqual([
      [0, 0],
      [0.1, 0],
    ]);
  });

  it('extrudes the outline with its holes, flipping the depth axis', () => {
    const drawing = sketchDrawing({
      mode: 'extrude',
      outerPoints: square,
      holes: [[[0, 0.1]]],
      output,
      saveToLibrary: true,
      now: 7,
    });

    expect(drawing).toMatchObject({ mode: 'extrude', bevel: true, widthMm: 64, depthMm: 64, saveToLibrary: true });
    expect(drawing.nodes[0]).toMatchObject({
      id: 'node-extrude-7',
      nodeType: 'contour_extrude',
      contour: {
        outerLoop: [
          [-0.2, 0.2],
          [0.2, 0.2],
          [0.2, -0.2],
        ],
        holes: [[[0, -0.1]]],
        bevel: true,
      },
    });
  });

  it('revolves the outline as a lathe profile without bevel', () => {
    const drawing = sketchDrawing({
      mode: 'revolve',
      outerPoints: square,
      holes: [],
      output,
      saveToLibrary: false,
      now: 7,
    });

    expect(drawing.bevel).toBe(false);
    expect(drawing.nodes[0]).toMatchObject({
      id: 'node-lathe-7',
      nodeType: 'lathe',
      lathe: {
        profilePoints: [
          [0.2, 0.2],
          [0.2, 0.2],
          [0.2, -0.2],
        ],
        segments: 36,
      },
    });
  });
});
