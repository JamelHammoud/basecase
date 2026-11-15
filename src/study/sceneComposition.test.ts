import { afterEach, describe, expect, it, vi } from 'vitest';
import { bracketAndServo, BRACKET_CODE, tunedAnswer } from '../agent/fixtures/tunedBracket';
import { DEFAULT_PROJECT } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { checkedRender } from '../utils/platform/renderedCad';
import { measureTriangles } from '../three/meshMeasure';
import { compileStudyDimension } from './dimensions';
import { refreshStudyGeometry } from './geometry';
import { studyScene } from './scene';
import type { StudyKnob, StudyScene } from './types';

const settings: StudyKnob[] = [
  { id: 'length', kind: 'foot', values: [{ length: 1.5 }] },
  { id: 'wall', kind: 'dimension', part: 'bracket', name: 'wall', values: [3] },
  { id: 'width', kind: 'foot', values: [{ width: 2 }] },
];

afterEach(() => vi.restoreAllMocks());

describe('combined CAD and foot choices', () => {
  it.each([{ order: [0, 1, 2] }, { order: [2, 1, 0] }])(
    'compiles before scaling both foot axes for setting order $order',
    async ({ order }) => {
      const foot = { ...bracketAndServo()[0], name: 'Foot' };
      const scene: StudyScene = await refreshStudyGeometry(
        { parts: [foot], project: DEFAULT_PROJECT, measures: {}, triangles: {} },
        [foot.id],
      );
      const original = structuredClone(scene);
      const answer = tunedAnswer(3);
      const render = vi.spyOn(platformBridge, 'renderCad').mockResolvedValue(checkedRender(answer.result));
      const knobs = order.map((index) => settings[index]);
      const chosen = await studyScene(scene, knobs, [0, 0, 0], {
        dimension: compileStudyDimension,
        geometry: refreshStudyGeometry,
      });
      const part = chosen.parts[0];
      const triangles = measureTriangles(chosen.triangles[part.id]);

      expect(render).toHaveBeenCalledOnce();
      expect(render).toHaveBeenCalledWith('openscad', BRACKET_CODE.replace('wall = 2;', 'wall = 3;'), foot.cad?.expect);
      expect(part.cad?.code).toContain('wall = 3;');
      expect(part.dimensions).toEqual({ width: 80, height: 3, depth: 45 });
      expect(chosen.measures[part.id]?.volumeMm3).toBeCloseTo(80 * 3 * 45, 5);
      expect(triangles.volumeMm3).toBeCloseTo(80 * 3 * 45, 5);
      expect(triangles.max[0] - triangles.min[0]).toBeCloseTo(80, 5);
      expect(triangles.max[2] - triangles.min[2]).toBeCloseTo(45, 5);
      expect(scene).toEqual(original);
    },
  );
});
