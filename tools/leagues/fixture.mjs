import fs from 'node:fs/promises';
import path from 'node:path';
import loadMujoco from '@mujoco/mujoco';
import { ROOT, leagueModule, appModule } from './runtime.mjs';

const { roverLeagueFixture } = await leagueModule('fixtures');
const { adjudicate, closeLeague } = await leagueModule('adjudication');
const { replayLeagueSeed } = await leagueModule('replay');
const { hashValue } = await leagueModule('validation');
const { galleryBundleBytes } = await appModule('src/gallery/galleryBundle.ts');
const { manifest, entries, bundles } = roverLeagueFixture();
const mj = await loadMujoco();
const closure = closeLeague({ manifest, entries, now: '2026-11-02T00:00:00.000Z', entropy: 'f'.repeat(64) });
const provenance = { repository: 'JamelHammoud/basecase', commit: '0'.repeat(40), runId: 'seeded-fixture' };
const frozen = await adjudicate({
  manifest,
  closure,
  provenance,
  replay: (entry, seed) =>
    replayLeagueSeed(mj, manifest, entry, {
      bytes: galleryBundleBytes(bundles.find((bundle) => bundle.slug === entry.id)),
      seed,
    }),
});
const directory = path.join(ROOT, 'public/leagues/rover-sprint');

await fs.mkdir(directory, { recursive: true });
await fs.writeFile(
  path.join(directory, 'board.json'),
  `${JSON.stringify({ manifest, entries: closure.entries, closure, frozenHash: hashValue(frozen) })}\n`,
);
await fs.writeFile(path.join(directory, 'results.json'), `${JSON.stringify(frozen)}\n`);

for (const bundle of bundles)
  await fs.writeFile(path.join(directory, `${bundle.slug}.json`), galleryBundleBytes(bundle));

console.log(
  JSON.stringify({
    frozenHash: hashValue(frozen),
    standings: frozen.standings.map(({ entryId, passes, score, budget }) => ({ entryId, passes, score, budget })),
  }),
);
