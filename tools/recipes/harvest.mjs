#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPart } from '../../electron/cad-kernel/client.mjs';
import { scadPorts } from '../../electron/cad-mcp/recipes/scadPorts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const USAGE = 'Usage: node tools/recipes/harvest.mjs <scene.json> <part id or name> [--out <dir>]';

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export function scadParameters(code) {
  return code
    .split('\n')
    .flatMap((line) => [...line.matchAll(/(?<=^|;)\s*([A-Za-z_]\w*)\s*=\s*([^;]+);/g)])
    .map(([, name, value]) => `${name}=${value.trim()}`);
}

export function findPart(scene, key) {
  const parts = scene.parts ?? scene.project?.parts ?? [];
  const wanted = String(key).toLowerCase();

  return parts.find((p) => p.cad?.code && (p.id === key || String(p.name).toLowerCase() === wanted));
}

export function candidateRecipe(part, { ports = [], stats = null, source = '' } = {}) {
  const language = part.cad.language ?? 'openscad';
  const words = slug(part.name).split('_').filter(Boolean);

  return {
    name: slug(part.name || part.id),
    language,
    use: part.note ? String(part.note).split('\n')[0] : `TODO: one line on what ${part.name} is for`,
    tags: words.join(' '),
    params: language === 'openscad' ? scadParameters(part.cad.code).join(', ') : 'TODO',
    ports: ports.length ? [...new Set(ports.map((p) => `${p.name} (${p.kind})`))].join(', ') : 'none reported',
    code: part.cad.code,
    expect: { ports: [...new Set(ports.map((p) => p.name))] },
    harvested: { from: source, part: part.id, size: stats?.bbox?.size ?? null, volume: stats?.volume ?? null },
  };
}

const REVIEW = [
  'Review before adding to electron/cad-mcp/recipes/:',
  '- Turn the scene-specific sizes into parameters of a library module, and keep the snippet on a neutral object (examples leak into designs).',
  '- Wrap it as a module in vendor/robotics/ with PORT echoes for its interfaces, placed with placed().',
  '- Add checks (fits, sweeps, no overlap) and run the recipe tests.',
];

function writeCandidate(recipe, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  const file = path.join(outDir, `${recipe.name}.candidate.mjs`);
  const body = `${REVIEW.map((l) => `// ${l}`).join('\n')}\nexport const CANDIDATE = ${JSON.stringify(recipe, null, 2)};\n`;

  fs.writeFileSync(file, body);

  return file;
}

async function main(argv) {
  const [sceneFile, key] = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out');
  const outIndex = argv.indexOf('--out');
  const outDir = outIndex >= 0 ? argv[outIndex + 1] : path.join(root, 'scratch', 'recipes');

  if (!sceneFile || !key) throw new Error(USAGE);

  const part = findPart(JSON.parse(fs.readFileSync(sceneFile, 'utf-8')), key);

  if (!part) throw new Error(`No modeled part "${key}" in ${sceneFile}.`);

  const language = part.cad.language ?? 'openscad';
  const [compiled, echoed] = await Promise.all([
    renderPart(language, part.cad.code),
    language === 'openscad' ? scadPorts(part.cad.code) : Promise.resolve({ ports: [] }),
  ]);

  if (!compiled.ok) throw new Error(`${part.id} no longer compiles:\n${compiled.error}`);

  const file = writeCandidate(
    candidateRecipe(part, { ports: echoed.ports, stats: compiled.stats, source: path.basename(sceneFile) }),
    outDir,
  );

  process.stdout.write(`Wrote ${file}\n${REVIEW.join('\n')}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    });
}
