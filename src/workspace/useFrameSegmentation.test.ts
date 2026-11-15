import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainingFrame } from '../vision/frameSet';
import { segmentationPoints } from '../vision/segmentationMath';
import { useFrameSegmentation } from './useFrameSegmentation';

const session = vi.hoisted(() => ({ load: vi.fn(), segment: vi.fn(), close: vi.fn() }));

vi.mock('../vision/segmentationRuntime', () => ({ createSegmentationRuntime: () => session }));

const frame: TrainingFrame = {
  id: 'frame',
  camera: 'front',
  seed: 0,
  width: 4,
  height: 4,
  jpeg: new Uint8Array(),
  depth: new Float32Array(16),
  annotations: [],
};
const visible = { size: [4, 4] as [number, number], counts: [0, 16] };

function setup() {
  let actions: ReturnType<typeof useFrameSegmentation> | undefined;

  function Harness() {
    actions = useFrameSegmentation();

    return null;
  }

  renderToString(createElement(Harness));

  return actions!;
}

beforeEach(() => {
  session.load.mockReset().mockResolvedValue(undefined);
  session.segment.mockReset().mockImplementation(async (_bitmap, points) => {
    segmentationPoints(points, frame.width, frame.height);

    return visible;
  });
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ close: vi.fn() }));
});

afterEach(() => vi.unstubAllGlobals());

describe('segmentation prompt history', () => {
  it('keeps successful refinements and discards a refused point before retrying the same label', async () => {
    const actions = setup();
    const request = { frame, classId: 0, instance: 'cup' };

    await actions.segment({ ...request, point: [1, 1] });
    await expect(actions.segment({ ...request, point: [4, 1] })).rejects.toThrow(/foreground point/);
    await expect(actions.segment({ ...request, point: [2, 2] })).resolves.toMatchObject({ instance: 'cup' });
    expect(session.segment.mock.calls.at(-1)?.[1]).toEqual([
      { x: 1, y: 1, label: 1 },
      { x: 2, y: 2, label: 1 },
    ]);
  });

  it('discards a refinement that returned no visible label', async () => {
    const actions = setup();
    const request = { frame, classId: 0, instance: 'cup' };

    await actions.segment({ ...request, point: [1, 1] });
    session.segment.mockResolvedValueOnce({ size: [4, 4], counts: [16] });
    await expect(actions.segment({ ...request, point: [2, 2] })).resolves.toBeNull();
    await actions.segment({ ...request, point: [3, 3] });
    expect(session.segment.mock.calls.at(-1)?.[1]).toEqual([
      { x: 1, y: 1, label: 1 },
      { x: 3, y: 3, label: 1 },
    ]);
  });
});
