import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { modelAsset } from './modelAsset.mjs';
import { ModelStore } from './modelRepo.mjs';

const bytes = new TextEncoder().encode('model');
const ref = {
  owner: 'tester',
  repo: 'vision',
  revision: 'a'.repeat(40),
  path: 'onnx/model.onnx',
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  maxBytes: 10,
};
let dir;

afterEach(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });

  dir = undefined;
});

describe('scoped model binary assets', () => {
  it('streams only a model prepared by the guarded downloader', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'model-asset-'));

    const models = new ModelStore({ dir, client: () => ({ downloadResponse: async () => new Response(bytes) }) });
    const request = new Request(`app://basecase/api/vision-model/${ref.sha256}`);

    expect(modelAsset(models, request).status).toBe(404);
    await models.prepare(ref);

    const response = modelAsset(models, request);

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(modelAsset(models, new Request('app://basecase/api/vision-model/not-a-hash')).status).toBe(404);
    expect(modelAsset(models, new Request(`app://basecase/api/vision-model/${ref.sha256}/auth`)).status).toBe(404);
    expect(modelAsset(models, new Request('app://basecase/index.html'))).toBeNull();
  });
});
