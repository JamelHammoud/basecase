import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesAtTag, startFakeHub } from '../../e2e/fakeHub.ts';
import { newDataset } from '../../src/datasets/datasetFile.ts';
import { frameSetHash } from '../../src/vision/frameSet.ts';
import { buildImageDataset } from '../../src/vision/imageDatasetBuild.ts';
import { annotationFromInstances } from '../../src/vision/imageMasks.ts';
import { readImagePackage } from '../../src/vision/imagePackage.ts';
import { HubAccount } from './index.mjs';

const TOKEN = 'hf_testTokenThatMustNeverLeak0123456789';
const sealing = { available: () => false };
let hub;
let dir;

afterEach(async () => {
  await hub?.close();

  if (dir) fs.rmSync(dir, { recursive: true, force: true });

  hub = undefined;
  dir = undefined;
});

function fixture() {
  const annotation = annotationFromInstances({
    instanceIds: new Uint32Array([0, 7, 7, 7]),
    width: 2,
    height: 2,
    instance: 'block',
    instanceId: 7,
    classId: 4,
  });

  return {
    version: 1,
    id: 'frames',
    name: 'Blocks',
    caseId: null,
    sceneId: null,
    seed: 42,
    classes: [{ id: 4, name: 'Block', keypoints: ['corner'] }],
    createdAt: 'now',
    frames: [
      {
        id: 'frame',
        seed: 42,
        camera: 'camera',
        width: 2,
        height: 2,
        jpeg: new Uint8Array([255, 216, 255, 217]),
        depth: new Float32Array([0, 12, 13, 14]),
        annotations: [{ ...annotation, keypoints: [{ name: 'corner', x: 1, y: 1, visible: true }] }],
      },
    ],
  };
}

const atLayout = (files, layout) =>
  Object.fromEntries(
    Object.entries(files)
      .filter(([name]) => name.startsWith(`${layout}/`))
      .map(([name, bytes]) => [name.slice(layout.length + 1), bytes]),
  );

describe('publishing an image dataset', () => {
  it('commits both layouts and its card, then downloads the tagged labels and image bytes unchanged', async () => {
    hub = await startFakeHub({ token: TOKEN });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-image-dataset-'));

    const account = new HubAccount({ libraryDir: dir, secrets: sealing, endpoint: () => hub.url });
    const set = fixture();
    const dataset = newDataset({
      id: 'blocks',
      name: 'Blocks',
      task: '',
      members: [],
      at: 'now',
      imageMembers: [{ frameSetId: set.id, frameIds: ['frame'], hash: await frameSetHash(set) }],
    });
    const files = await buildImageDataset(dataset, [set]);

    await account.signIn(TOKEN);
    await account.publish({ name: 'blocks', files, tag: 'dataset-v1' });

    const repo = hub.repos.get('tester/blocks');
    const card = Buffer.from(files['README.md']).toString('utf-8');
    const downloaded = await account.datasetFiles({ owner: 'tester', repo: 'blocks', rev: 'dataset-v1' });

    expect(card).toContain('tags:\n  - basecase-image-dataset');
    expect(card).toContain('[COCO](coco/)');
    expect(card).toContain('[YOLO](yolo/)');
    expect(filesAtTag(repo, 'dataset-v1').get('README.md')).toEqual(Buffer.from(files['README.md']));
    expect(repo.commits).toHaveLength(1);

    for (const layout of ['coco', 'yolo']) {
      const restored = readImagePackage(atLayout(downloaded.files, layout));

      expect(restored.classes).toEqual([{ ...set.classes[0], id: 0 }]);
      expect(restored.frames[0]).toMatchObject({
        ...set.frames[0],
        id: expect.stringMatching(/^[a-f0-9]{64}$/),
        annotations: [{ ...set.frames[0].annotations[0], classId: 0 }],
      });
      expect(atLayout(downloaded.files, layout)).toEqual(atLayout(files, layout));
    }
  });
});
