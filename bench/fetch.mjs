#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROBOTS } from './robots.mjs';
import { assembleUrdf, writeBinaryStl, skeletonFromMjcf } from './geometry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, 'data');

async function gh(url) {
  const res = await fetch(`https://api.github.com/${url}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'basecase-bench' },
  });

  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`);

  return res.json();
}

async function raw(repo, branch, file) {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/${file}`);

  if (!res.ok) throw new Error(`raw ${res.status} for ${file}`);

  const buf = Buffer.from(await res.arrayBuffer());

  if (buf.length < 300 && buf.toString('utf8').startsWith('version https://git-lfs'))
    return lfsObject(repo, branch, file);

  return buf;
}

async function lfsObject(repo, branch, file) {
  const lfs = await fetch(`https://media.githubusercontent.com/media/${repo}/${branch}/${file}`);

  if (!lfs.ok) throw new Error(`LFS ${lfs.status} for ${file}`);

  return Buffer.from(await lfs.arrayBuffer());
}

async function fetchRobot(key) {
  const robot = ROBOTS[key];
  const dir = path.join(DATA, key);

  fs.mkdirSync(path.join(dir, 'meshes'), { recursive: true });

  const meta = await gh(`repos/${robot.repo}`);
  const branch = meta.default_branch;

  if (robot.mjcfSkeleton) {
    const xml = (await raw(robot.repo, branch, robot.mjcfSkeleton)).toString('utf8');

    fs.writeFileSync(path.join(dir, 'skeleton.xml'), xml);

    const skel = skeletonFromMjcf(xml);

    fs.writeFileSync(path.join(dir, 'skeleton.json'), JSON.stringify(skel, null, 1));
    console.log(
      `${key}: skeleton with ${skel.points.length} joints, ${skel.bounds.size.map(Math.round).join(' × ')} mm`,
    );

    return;
  }

  const tree = await gh(`repos/${robot.repo}/git/trees/${branch}?recursive=1`);
  const files = tree.tree.filter((t) => t.type === 'blob').map((t) => t.path);
  const urdf = (await raw(robot.repo, branch, robot.urdf)).toString('utf8');

  fs.writeFileSync(path.join(dir, 'robot.urdf'), urdf);

  const urdfDir = path.posix.dirname(robot.urdf);
  const refs = Array.from(new Set([...urdf.matchAll(/filename="([^"]+)"/g)].map((m) => m[1])));
  const local = new Map();

  for (const ref of refs) {
    const base = path.posix.basename(ref);
    const candidates = files.filter((f) => path.posix.basename(f) === base);

    candidates.sort((a, b) => score(b) - score(a));

    function score(f) {
      const rootDir = urdfDir.split('/').slice(0, -1).join('/');

      return (f.startsWith(urdfDir) ? 4 : 0) + (f.startsWith(rootDir) ? 2 : 0) - (f.includes('collision') ? 3 : 0);
    }

    const pick = candidates[0];

    if (!pick) {
      console.warn(`  missing mesh ${ref}`);

      continue;
    }

    const out = path.join(dir, 'meshes', base);

    if (!fs.existsSync(out)) fs.writeFileSync(out, await raw(robot.repo, branch, pick));

    local.set(ref, out);
  }

  const { triangles, parts, bounds } = assembleUrdf(urdf, (ref) => local.get(ref), robot.pose);

  writeBinaryStl(path.join(dir, 'reference.stl'), triangles);
  fs.writeFileSync(
    path.join(dir, 'reference.json'),
    JSON.stringify({ parts, bounds, triangles: triangles.length / 9 }, null, 1),
  );
  console.log(
    `${key}: ${parts} visual meshes, ${triangles.length / 9} triangles, ${bounds.size.map(Math.round).join(' × ')} mm`,
  );
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ROBOTS);

for (const key of keys) {
  try {
    await fetchRobot(key);
  } catch (err) {
    console.error(`${key}: ${err.message}`);
  }
}
