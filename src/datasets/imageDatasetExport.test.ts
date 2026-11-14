import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { importCoco } from '../vision/coco';
import { hashFrameSet } from '../vision/frameSet';
import { visionFixture } from '../vision/fixtures';
import { importYolo } from '../vision/yolo';
import { splitOf } from './datasetSplit';
import { exportImageDatasetFiles, exportImageDatasetZip } from './imageDatasetClient';

const under = (files: Record<string, Uint8Array>, prefix: string) =>
  Object.fromEntries(
    Object.entries(files)
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, bytes]) => [path.slice(prefix.length), bytes]),
  );

describe('image Dataset archive and Hub files', () => {
  it('writes both standard layouts with one deterministic split and preserves mixed try files', async () => {
    const first = visionFixture(7);
    const secondContent = { ...visionFixture(3), name: 'More cubes', seed: 91 };
    const second = { ...secondContent, id: hashFrameSet(secondContent) };
    const job = {
      sets: [first, second],
      name: 'blocks-dataset',
      seed: 831,
      extraFiles: { 'meta/info.json': new TextEncoder().encode('{"codebase_version":"v3.0"}') },
    };
    const files = await exportImageDatasetFiles(job);
    const archive = unzipSync(await exportImageDatasetZip(job));
    const zipped = under(archive, `${job.name}/`);
    const cocoFiles = under(files, 'coco/');
    const yoloFiles = under(files, 'yolo/');
    const coco = importCoco(cocoFiles)!;
    const yolo = importYolo(yoloFiles)!;
    const split = splitOf(
      coco.frames.map((frame) => frame.id),
      job.seed,
    );
    const train = JSON.parse(new TextDecoder().decode(cocoFiles['annotations/instances_train.json']));

    expect(zipped).toEqual(files);
    expect(files['meta/info.json']).toEqual(job.extraFiles['meta/info.json']);
    expect(coco).not.toBeNull();
    expect(yolo).toEqual(coco);
    expect(coco.seed).toBe(job.seed);
    expect(coco.frames.length).toBeGreaterThanOrEqual(first.frames.length);
    expect(train.images.map((image: { basecase_id: string }) => image.basecase_id)).toEqual(split.train);
    expect(
      Object.keys(yoloFiles)
        .filter((path) => path.startsWith('images/train/'))
        .sort(),
    ).toEqual(split.train.map((id) => `images/train/${id}.jpg`).sort());
    expect(coco.frames[0].depth).toBeInstanceOf(Float32Array);
  });
});
