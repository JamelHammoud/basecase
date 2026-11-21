import { build } from 'vite';
import loadMujoco from '@mujoco/mujoco';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const output = path.resolve('scratch/body-sequence-benchmark');

await build({
  configFile: false,
  logLevel: 'silent',
  build: {
    ssr: path.resolve('src/reality/bodySequenceComparison.fixtures.ts'),
    outDir: output,
    emptyOutDir: true,
    minify: false,
  },
});

const { compareBodySequences } = await import(
  pathToFileURL(path.join(output, 'bodySequenceComparison.fixtures.js')).href
);
const records = await compareBodySequences(await loadMujoco());

process.stdout.write(
  `${JSON.stringify(
    records.map(({ name, strategy, completeMs, physicsSteps, heldOutRms, reason }) => ({
      name,
      strategy,
      completeMs,
      physicsSteps,
      heldOutRms,
      reason,
    })),
    null,
    2,
  )}\n`,
);
