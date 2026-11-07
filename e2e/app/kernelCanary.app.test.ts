import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { allowedProbes, parseProbes, probeCode } from './kernelProbes';
import { startProbeWorld, type ProbeWorld } from './probeServer';

interface NodeKernel {
  renderPart: (language: string, code: string) => Promise<{ error?: string }>;
  stopKernels: () => void;
}

const nodeHost = pathToFileURL(path.resolve('electron', 'cad-kernel', 'nodeHost', 'client.mjs')).href;
const { createNodeKernel } = await import(nodeHost);
const unsandboxed: NodeKernel = createNodeKernel({ permissionModel: false });
let world: ProbeWorld | undefined;

afterAll(async () => {
  unsandboxed.stopKernels();
  await world?.close();
});

describe('Node kernel host', () => {
  it('kernel sandbox canary claims denial (fails by design: this host can read files)', async () => {
    world = await startProbeWorld('http://127.0.0.1:9/never');

    const res = await unsandboxed.renderPart('replicad', probeCode(world.targets));
    const report = parseProbes(res.error);

    if (!report) return;

    expect({ allowed: allowedProbes(report), hits: world.hits }).toEqual({ allowed: [], hits: [] });
  });
});
