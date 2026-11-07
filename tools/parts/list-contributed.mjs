#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const libraryDir = process.env.BASECASE_LIBRARY ?? path.join(root, 'library');
const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const items = readJson(path.join(libraryDir, 'sourced-parts.json'), []);
const shipped = readJson(path.join(root, 'src', 'data', 'component-meshes.json'), {});
const sceneDir = path.join(libraryDir, 'scenes');
const scenes = fs.existsSync(sceneDir) ? fs.readdirSync(sceneDir).filter((f) => f.endsWith('.json')) : [];
const scenesUsing = (id) =>
  scenes.flatMap((f) => {
    const scene = readJson(path.join(sceneDir, f), {});
    const used =
      (scene.parts ?? []).some((p) => p.componentId === id || p.supplyId === id) ||
      (scene.project?.extras ?? []).some((x) => x.key.endsWith(`:${id}`));

    return used ? [scene.name ?? f] : [];
  });

if (!items.length) console.log('No contributed parts.');

for (const item of items) {
  const flags = [
    shipped[item.id] ? 'ALREADY IN THE CATALOG' : '',
    item.link?.status === 'confirmed' ? '' : `link ${item.link?.status}`,
    !item.mesh && item.kind === 'part' ? 'no CAD' : '',
    item.mesh?.sizeProblem ?? '',
    item.mesh && /not stated|unknown/i.test(item.mesh.license) ? 'license not stated: check before shipping' : '',
  ].filter(Boolean);

  console.log(`${item.id} (${item.kind}): ${item.maker} ${item.mpn}`);
  console.log(`  product ${item.url}`);

  if (item.mesh) console.log(`  CAD ${item.mesh.cadUrl}, ${item.mesh.source}, license ${item.mesh.license}`);

  console.log(`  used by ${scenesUsing(item.id).join(', ') || 'no saved scene'}`);

  if (flags.length) console.log(`  check: ${flags.join('; ')}`);
}
