import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { boundsOf, parseStl, silhouette, writeBinaryStl } from '../bench/geometry.mjs';
import { scoreModels, writeOverlay } from '../bench/score.mjs';
import { readPng, scoreAgainstDrawing, writeDrawingOverlay } from '../bench/drawing.mjs';
import { readGlbTriangles } from '../bench/glb.mjs';
import {
  box,
  drawingPng,
  filteredRows,
  hash,
  rawPng,
  robot,
  summarize,
  writeTestGlb,
} from './bench-score.fixtures.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-score-'));

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('bench scorer', () => {
  it('scores a box against itself and a stretched box', () => {
    const a = box([40, 30, 100]);
    const b = box([50, 30, 90], [5, -3, 2]);

    expect(summarize(scoreModels(a, a))).toEqual({
      total: 100,
      silhouetteIoU: { front: 1, side: 1, top: 1, mean: 1 },
      chamferMm: 0,
      chamferPctOfHeight: 0,
      sizeMm: { agent: [40, 30, 100], real: [40, 30, 100] },
      sizeRatio: [1, 1, 1],
      parts: { agent: null, real: null },
      refYawQuarterTurns: 0,
      views: {
        front: '65x161 ebdb10dd336bf8d0 ebdb10dd336bf8d0',
        side: '49x161 d98b407d1528636c d98b407d1528636c',
        top: '65x49 76a3e4d4a51afc26 76a3e4d4a51afc26',
      },
    });
    expect(summarize(scoreModels(a, b, { agentParts: 3, refParts: 1 }))).toEqual({
      total: 78,
      silhouetteIoU: { front: 0.734, side: 0.9, top: 0.799, mean: 0.811 },
      chamferMm: 2.7,
      chamferPctOfHeight: 2.7,
      sizeMm: { agent: [50, 30, 90], real: [40, 30, 100] },
      sizeRatio: [1.25, 1, 0.9],
      parts: { agent: 3, real: 1 },
      refYawQuarterTurns: 0,
      views: {
        front: '81x161 ba991b71e1e873d2 ad32d0dbac56f747',
        side: '49x161 d98b407d1528636c 083952246e3c5149',
        top: '81x49 a4f30410cce12fe6 3e0a5a2b6f0ecaf6',
      },
    });
  }, 30000);

  it('scores a blocky robot over all 24 orientations', () => {
    const agent = Float32Array.from([...box([70, 40, 150], [-35, -20, 0]), ...box([20, 20, 30], [-10, -10, 150])]);

    expect(summarize(scoreModels(robot(), agent, { allOrientations: true }))).toEqual({
      total: 64,
      silhouetteIoU: { front: 0.682, side: 0.557, top: 0.579, mean: 0.606 },
      chamferMm: 7.3,
      chamferPctOfHeight: 4.3,
      sizeMm: { agent: [70, 40, 180], real: [80, 60, 170] },
      sizeRatio: [0.88, 0.67, 1.06],
      parts: { agent: null, real: null },
      refYawQuarterTurns: 3,
      views: {
        front: '73x161 c43880ca1f2fd2dc 86e76247dcd79c59',
        side: '55x161 a9a3b1b5de224d5d 5384aaadc01e3e2d',
        top: '73x55 1ec03820f7f2d0cc 6330bbd41b01b4fe',
      },
    });
  }, 30000);

  it('rasterizes silhouettes and writes the overlay', () => {
    const tris = Float32Array.from([...robot(), 0, 0, 0, 10, 10, 10, 20, 20, 20]);
    const b = boundsOf(tris);
    const grid = { min: b.min, cell: 4, w: 30, h: 50 };
    const masks = ['front', 'side', 'top'].map((v) => hash(silhouette(tris, v, grid)));
    const file = path.join(tmp, 'overlay.png');

    writeOverlay(file, scoreModels(robot(), box([60, 40, 160], [-30, -20, 0])).views);

    expect(masks).toEqual(['1d276a1a0c526e42', '7175710ae4ec0794', 'd05ab3673b772029']);
    expect(hash(fs.readFileSync(file))).toBe('7090b4a376f97941');
  }, 30000);

  it('round-trips binary STL', () => {
    const file = path.join(tmp, 'robot.stl');

    writeBinaryStl(file, robot());

    expect(Array.from(parseStl(fs.readFileSync(file)))).toEqual(Array.from(robot()));
  });
});

describe('bench drawing', () => {
  it('decodes every PNG filter and color type', () => {
    const decoded = [0, 2, 4, 6].map((type) => {
      const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
      const file = path.join(tmp, `filters-${type}.png`);

      fs.writeFileSync(file, rawPng({ w: 7, h: 10, type, rows: filteredRows(7, 10, ch) }));

      const { w, h, rgba } = readPng(file);

      return `${w}x${h} ${hash(rgba)}`;
    });

    expect(decoded).toEqual([
      '7x10 6533c6b19b2b2cfe',
      '7x10 c5f6e4e7e93d2d37',
      '7x10 b5441bf6623105ee',
      '7x10 670fd9bad6dc1d84',
    ]);
  });

  it('scores a model against a drawing and writes the overlay', () => {
    const drawing = path.join(tmp, 'drawing.png');
    const overlay = path.join(tmp, 'drawing-overlay.png');

    drawingPng(drawing);

    const s = scoreAgainstDrawing(robot(), drawing, 60);

    writeDrawingOverlay(overlay, s.view);

    expect(s.iou).toBeCloseTo(0.554, 6);
    expect(s.widthRatioByBand).toEqual([0.96, 0.93, 0.93, 0.93, 1.26, 0.99, 0.9, 0.9, 0.44, 0.29]);
    expect(s.aspect).toEqual({ model: 0.492, drawing: 0.508 });
    expect(`${s.view.w}x${s.view.h} ${hash(s.view.r)} ${hash(s.view.g)}`).toBe(
      '35x61 5e41031a493775cc f0c3218e5283b6e2',
    );
    expect(hash(fs.readFileSync(overlay))).toBe('518cc00ddfcdbc9a');
  });
});

describe('bench GLB reader', () => {
  it('reads indexed, strided and nested meshes', () => {
    const file = path.join(tmp, 'part.glb');

    writeTestGlb(file);

    expect(Array.from(readGlbTriangles(file), (v) => Math.round(v * 1000) / 1000)).toEqual([
      1, -3, 2, 1, -3, 12, -9, -3, 2, 1, -3, 2, -9, -3, 2, 1, -13, 2, 1, -3, 2, 1, -3, 12, -9, -3, 2, 7, -9, 8, 12, -9,
      8, 7, -9, 13,
    ]);
  });
});
