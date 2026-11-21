import loadMujoco from '@mujoco/mujoco';
import { beforeAll, expect, it } from 'vitest';
import { nativeContactReplay } from '../../../tools/sim/nativeContactReplay.mjs';
import { replayDifferences } from '../../../tools/sim/contactReplayComparison.mjs';
import { closedReplays } from './closedReplay';
import { closedLinkages } from './closedLinkages';

let replays: ReturnType<typeof closedReplays>;
let version: string;

beforeAll(async () => {
  const mj = await loadMujoco();

  version = mj.mj_versionString();
  replays = closedReplays(mj);
});

it.each(closedLinkages.map((spec, index) => ({ name: spec.name, index })))(
  'replays $name in native C and WASM',
  async ({ index, name }) => {
    const replay = replays[index];
    const started = performance.now();
    const native = await nativeContactReplay(replay, version);
    const elapsedMs = performance.now() - started;
    const { drift, contactDifferences } = replayDifferences(replay, native.cases[0]);

    expect(native.version).toBe(version);
    expect(drift).toBeLessThan(1e-6);
    expect(contactDifferences).toBe(0);
    console.info(
      JSON.stringify({
        mechanism: name,
        steps: replay.controls.length,
        nativeReplayMs: elapsedMs,
        drift,
        contactDifferences,
      }),
    );
  },
);
