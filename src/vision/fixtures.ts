import { hashFrame, hashFrameSet, type VisionFrame, type VisionFrameSet } from './frameSet';

export function visionFixture(count = 1): VisionFrameSet {
  const frames = Array.from({ length: count }, (_, seed) => {
    const frame: VisionFrame = {
      id: '',
      width: 4,
      height: 3,
      image: new Uint8Array([1, 2, 3]),
      depth: new Float32Array([0, 1.5, 2, 0, 0, 3, 4, 0, 0, 0, 0, 0]),
      annotations: [
        {
          id: 'cube',
          partId: 'part-1',
          classId: 7,
          bbox: [1, 0, 2, 2],
          mask: { size: [3, 4], counts: [3, 2, 1, 2, 4] },
          polygons: [[1, 0, 3, 0, 3, 2, 1, 2]],
          keypoints: { center: { x: 2, y: 1, visibility: 2 } },
        },
      ],
      camera: {
        key: 'front',
        label: 'Front',
        lens: { model: 'pinhole', hfovDeg: 60 },
        position: [0, 0, 100],
        target: [0, 0, 0],
        up: [0, 1, 0],
      },
      seed,
    };

    return { ...frame, id: hashFrame(frame) };
  });
  const set: VisionFrameSet = {
    format: 'basecase-vision',
    version: 1,
    id: '',
    name: 'Cubes',
    caseId: 'cube-case',
    seed: 42,
    classes: [{ id: 7, name: 'Cube', kind: 'box', keypoints: ['center'] }],
    frames,
  };

  return { ...set, id: hashFrameSet(set) };
}
