import { shCheck } from '../lib/gate.mjs';

const app = (name, filter) => shCheck(name, 'npx', ['vitest', 'run', '--config', 'vitest.app.config.ts', '-t', filter]);

export default {
  id: 's0-kernel-sandbox',
  stage: 0,
  title: 'Agent-written CAD code runs in a Chromium sandbox on every OS',
  state: 'required',
  checks: [
    shCheck('kernel unit tests pass', 'npx', [
      'vitest',
      'run',
      'electron/cad-kernel',
      'electron/cad-mcp',
      'electron/security.test.mjs',
    ]),
    app('renders OpenSCAD and replicad in the packaged app sandbox', 'kernel sandbox renders'),
    app('probe: agent code cannot read files, use the network, spawn or reach Node', 'kernel sandbox denies'),
    app('a hung part is killed, and the next part renders', 'kernel sandbox recovers'),
  ],
  canaries: [
    app('the same probes, on an unsandboxed host, are seen to succeed', 'kernel sandbox canary claims denial'),
  ],
};
