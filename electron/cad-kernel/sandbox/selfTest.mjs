import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { exportStepFile } from '../stepExport.mjs';

const BOX_VOLUME = 6000;

const PARTS = [
  ['openscad', 'include <robotics.scad>\ncube([10, 20, 30]);'],
  ['replicad', 'return makeBox([0, 0, 0], [10, 20, 30]);'],
];

const TETRA = [
  0, 0, 0, 0, 20, 0, 20, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 20, 0, 20, 0, 20, 0, 0, 0, 20, 0, 0, 0, 20,
];
const PLACE = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

const STEP_JOB = {
  name: 'Self-test',
  bodies: [
    { name: "Box'); #1=X(", color: '#336699', place: PLACE, solid: { type: 'code', code: PARTS[1][1] } },
    { name: 'Mesh', color: '#999999', place: PLACE, solid: { type: 'mesh', positions: TETRA } },
  ],
};

async function exportedStep(kernel) {
  try {
    const { step, skipped } = await exportStepFile(kernel, STEP_JOB);

    return { ok: step.startsWith('ISO-10303-21;') && skipped === 0, products: step.match(/= PRODUCT\('/g)?.length };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

const probeCode = (fileUrl) => `return (async () => {
  const tries = {
    file: () => fetch(${JSON.stringify(fileUrl)}),
    network: () => fetch('http://127.0.0.1:9/'),
    node: async () => process.versions.node,
  };
  const reached = [];

  for (const [name, run] of Object.entries(tries)) {
    try {
      await run();
      reached.push(name);
    } catch {}
  }

  throw new Error('REACHED:' + reached.join(','));
})();`;

async function render(kernel, language, code) {
  return JSON.parse(Buffer.from(await kernel.render({ language, code, timeoutMs: 120000 })).toString());
}

export async function kernelSelfTest(kernel, { outFile, probeFile }) {
  const parts = [];

  for (const [language, code] of PARTS) {
    const res = await render(kernel, language, code);

    parts.push({ language, ok: res.ok, volume: res.stats?.volume, error: res.error });
  }

  const probe = await render(kernel, 'replicad', probeCode(pathToFileURL(probeFile).href));
  const reached = /REACHED:(.*)/.exec(probe.error ?? '')?.[1] ?? 'the probe didn’t run';
  const step = await exportedStep(kernel);
  const passed = parts.every((p) => p.ok && p.volume === BOX_VOLUME) && reached === '' && step.ok;

  fs.writeFileSync(outFile, JSON.stringify({ passed, parts, reached, step }, null, 2));
  kernel.stop();

  return passed;
}
