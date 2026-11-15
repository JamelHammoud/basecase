import { createHash } from 'node:crypto';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { box } from '../src/sim/fixtures/parts';
import type { VisionManifest } from '../src/vision/manifest';

export function simulatedCameraFixture() {
  return {
    name: 'Vision Target',
    parts: [{ ...box('target', [0, 250, 0], [500, 500, 20], 100), color: '#ffffff' }],
    project: {
      ...DEFAULT_PROJECT,
      cameras: [
        {
          id: 'target-camera',
          name: 'Target Camera',
          position: [0, 250, 300] as [number, number, number],
          target: [0, 250, 0] as [number, number, number],
          lens: { model: 'pinhole' as const, hfovDeg: 60 },
        },
      ],
    },
  };
}

export const visionManifest = (bytes: Uint8Array, label = 'cup', id = 'rfdetr-nano'): VisionManifest => ({
  version: 1,
  id,
  kind: 'detect',
  adapter: 'generic',
  classes: [label],
  input: { width: 2, height: 2, layout: 'nchw', mean: [0, 0, 0], std: [1, 1, 1], scale: 1 / 255 },
  model: {
    owner: 'example',
    repo: 'camera-fixture',
    revision: '0'.repeat(40),
    file: 'tiny.onnx',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  },
});
