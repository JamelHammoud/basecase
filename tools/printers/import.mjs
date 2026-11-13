import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { buildCatalog, renderCatalog } from './catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'data', 'printerCatalog.ts');
const CACHE = path.join(os.tmpdir(), 'basecase-printer-profiles');

const PROFILE_SOURCES = [
  { slicer: 'bambu', repo: 'bambulab/BambuStudio', tag: 'v02.09.01.70' },
  { slicer: 'orca', repo: 'OrcaSlicer/OrcaSlicer', tag: 'v2.5.0', makers: ['Prusa'] },
];

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'ignore' });

function sparseClone({ repo, tag }, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  git([
    'clone',
    '--depth',
    '1',
    '--filter=blob:none',
    '--sparse',
    '--branch',
    tag,
    `https://github.com/${repo}.git`,
    dir,
  ]);
  git(['sparse-checkout', 'set', 'resources/profiles'], dir);
}

function fetchProfiles(source) {
  const dir = path.join(CACHE, `${source.repo.replace('/', '-')}-${source.tag}`);
  const profiles = path.join(dir, 'resources', 'profiles');

  if (!fs.existsSync(profiles)) sparseClone(source, dir);

  return profiles;
}

async function main() {
  const sources = PROFILE_SOURCES.map((s) => ({
    slicer: s.slicer,
    version: s.tag.replace(/^v/, ''),
    makers: s.makers,
    profiles: fetchProfiles(s),
  }));
  const models = buildCatalog(sources);
  const options = await prettier.resolveConfig(OUT);

  fs.writeFileSync(OUT, await prettier.format(renderCatalog(models), { ...options, filepath: OUT }));

  const counts = sources.map(
    (s) => `${models.filter((m) => m.source.slicer === s.slicer).length} from ${s.slicer} ${s.version}`,
  );

  console.log(`Wrote ${models.length} printers (${counts.join(', ')}) to ${path.relative(ROOT, OUT)}`);
}

await main();
