import { describe, expect, it, vi } from 'vitest';
import { bracketAndServo, BRACKET_CODE, tunedAnswer } from '../agent/fixtures/tunedBracket';
import { DEFAULT_PROJECT } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { checkedRender } from '../utils/platform/renderedCad';
import { compileStudyDimension } from './dimensions';
import type { StudyScene } from './types';

const baseline = (): StudyScene => ({
  parts: bracketAndServo(),
  project: DEFAULT_PROJECT,
  measures: {},
  triangles: {},
});

describe('Study named dimensions', () => {
  it('renders the captured code in the kernel pool with its requirements, preserving source and following mates', async () => {
    const scene = baseline();
    const part = scene.parts[0];
    const answer = tunedAnswer(3);
    const render = vi.spyOn(platformBridge, 'renderCad').mockResolvedValue(checkedRender(answer.result));
    const changed = await compileStudyDimension({ scene, part: part.id, values: { wall: 3 } });

    expect(render).toHaveBeenCalledWith('openscad', BRACKET_CODE.replace('wall = 2;', 'wall = 3;'), part.cad?.expect);
    expect(changed.parts[0].cad?.code).toBe(answer.code);
    expect(changed.parts[0].dimensions.height).toBeCloseTo(3);
    expect(changed.parts[1].position[1] - scene.parts[1].position[1]).toBeCloseTo(1);
    expect(scene.parts[0].cad?.code).toBe(BRACKET_CODE);
    expect(changed.project).toBe(scene.project);

    render.mockRestore();
  });

  it('keeps the captured scene untouched when compilation or a requirement fails', async () => {
    const scene = baseline();
    const render = vi.spyOn(platformBridge, 'renderCad').mockResolvedValue({ ok: false, error: 'Wall is too thin.' });

    await expect(compileStudyDimension({ scene, part: 'bracket', values: { wall: 1 } })).rejects.toThrow(
      'Wall is too thin.',
    );
    expect(scene.parts[0].cad?.code).toBe(BRACKET_CODE);

    render.mockRestore();
  });

  it('refuses an unknown named dimension before calling the pool', async () => {
    const render = vi.spyOn(platformBridge, 'renderCad');

    await expect(
      compileStudyDimension({ scene: baseline(), part: 'bracket', values: { 'wall); cube(100);': 4 } }),
    ).rejects.toThrow('dimension');
    expect(render).not.toHaveBeenCalled();

    render.mockRestore();
  });

  it('refuses out-of-range choices rather than labeling a clamped result as the requested design', async () => {
    const render = vi.spyOn(platformBridge, 'renderCad');

    await expect(compileStudyDimension({ scene: baseline(), part: 'bracket', values: { wall: 9 } })).rejects.toThrow(
      'range',
    );
    expect(render).not.toHaveBeenCalled();

    render.mockRestore();
  });
});
