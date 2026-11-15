import { describe, expect, it } from 'vitest';
import { exportCoco } from '../../vision/cocoExport';
import type { FrameSet } from '../../vision/frameSet';
import { lerobotFiles } from '../lerobot';
import { importHandlers } from './dataImportJobs';
import { readImportSource, readSource } from './readSource';

const imageSet = (): FrameSet => ({
  version: 1,
  id: 'frames',
  name: 'Blocks',
  caseId: null,
  sceneId: null,
  seed: 1,
  classes: [],
  createdAt: 'now',
  frames: [
    {
      id: 'frame',
      seed: 1,
      camera: 'camera',
      width: 1,
      height: 1,
      jpeg: new Uint8Array([255, 216, 255, 217]),
      depth: new Float32Array([3]),
      annotations: [],
    },
  ],
});

const mixedSource = () => ({
  kind: 'bytes' as const,
  name: 'Mixed',
  files: {
    ...lerobotFiles({
      robotType: 'arm',
      jointNames: ['elbow'],
      videos: [],
      source: {},
      episodes: [
        {
          task: 'Move',
          frames: [0, 1],
          timestamps: new Float32Array([0, 0.04]),
          state: new Float32Array([0.1, 0.2]),
          action: new Float32Array([0.3, 0.4]),
          videos: {},
          imageStats: {},
          source: {},
        },
      ],
    }),
    ...Object.fromEntries(Object.entries(exportCoco(imageSet())).map(([path, bytes]) => [`coco/${path}`, bytes])),
  },
});

describe('mixed image and try imports', () => {
  it('reads both payloads and keeps the recording reader compatibility API', async () => {
    const found = await readImportSource(mixedSource());

    expect(found).toMatchObject({
      data: { format: 'lerobot-v2.1', names: ['elbow'], episodes: [{ task: 'Move' }] },
      images: imageSet(),
    });
    expect((await readSource(mixedSource()))?.data.episodes).toHaveLength(1);
  });

  it('summarizes and prepares images without discarding recording metadata', async () => {
    const run = importHandlers();
    const summary = await run.read(mixedSource());

    expect(summary).toMatchObject({ format: 'lerobot-v2.1', names: ['elbow'], episodes: 1 });
    expect(summary?.images).toEqual({ name: 'Blocks', frames: 1, classes: [] });

    const prepared = await run.prepareImages({ caseId: null, sceneId: null, objects: [] });

    expect(prepared.manifest.frames).toHaveLength(1);
    expect(run.nextImage().depth).toEqual(new Float32Array([3]));
  });
});
