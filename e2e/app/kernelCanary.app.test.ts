import { afterAll, describe, expect, it } from 'vitest';
import { createNodeKernel } from '../../electron/cad-kernel/nodeHost/client.mjs';
import { allowedProbes, parseProbes, probeCode } from './kernelProbes';
import { startProbeWorld, type ProbeWorld } from './probeServer';

const unsandboxed = createNodeKernel({ permissionModel: false });
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
