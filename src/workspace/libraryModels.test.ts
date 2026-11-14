import { describe, expect, it, vi } from 'vitest';
import type { ScenePart } from '../types/robotics';
import { sceneModel } from './libraryModels';

const plate: ScenePart = {
  id: 'plate',
  name: 'Plate',
  kind: 'box',
  category: 'primitives',
  role: 'solid',
  position: [10, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 10, depth: 30 },
  color: '#888888',
  note: 'Servo base',
  visible: true,
  locked: false,
  sourceImageDataUrl: 'data:image/png;base64,source',
};

describe('saved model source images', () => {
  it('awaits a scene capture while keeping its editable parts and relative positions', async () => {
    let finish = (_dataUrl: string) => {};
    const screenshot = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    const saved = sceneModel({
      sourceParts: [plate, { ...plate, id: 'lid', position: [70, 0, 0] }],
      single: null,
      sceneName: 'Servo housing',
      screenshot,
    });

    expect(screenshot).toHaveBeenCalledOnce();
    finish('data:image/png;base64,captured');

    const model = await saved;

    expect(model.sourceImageDataUrl).toBe('data:image/png;base64,captured');
    expect(model.name).toBe('Servo housing');
    expect(model.nodes.map((node) => node.position)).toEqual([
      [-30, 0, 0],
      [30, 0, 0],
    ]);
    expect(model.nodes[0].part).toMatchObject({ kind: 'box', note: 'Servo base' });
  });

  it('keeps a single selected part’s source image without capturing the canvas', async () => {
    const screenshot = vi.fn();
    const model = await sceneModel({ sourceParts: [plate], single: plate, sceneName: 'Scene', screenshot });

    expect(screenshot).not.toHaveBeenCalled();
    expect(model.sourceImageDataUrl).toBe(plate.sourceImageDataUrl);
    expect(model.name).toBe(plate.name);
    expect(model.description).toBe(plate.note);
  });
});
