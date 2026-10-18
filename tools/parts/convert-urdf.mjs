#!/usr/bin/env node
/**
 * Assembles a manufacturer's per-link meshes (STL) at the zero pose of their URDF and writes
 * the Parts-library GLB. For makers that publish meshes + URDF but no assembly STEP.
 *
 *   node tools/parts/convert-urdf.mjs <id…>
 *
 * sources.json entry, one of:
 *   { "urdf": "cad/<id>/robot.urdf", "meshDir": "cad/<id>/meshes", "rootLink"? }   URDF at the zero pose
 *   { "mjcf": "cad/<id>/robot.xml", "meshDir": "cad/<id>/assets" }    MuJoCo model at its default pose
 *   { "mesh": "cad/<id>/hand.stl", "meshScale": 0.001 }               one fused mesh (scale to meters)
 * plus optional "colors": { "<mesh file>": [r, g, b] }, "defaultColor", "modelColors": false, "rotate": [["x", 90]].
 * Model units are meters (mesh scale applied as written); output is mm in the studio frame (Y up).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { parseStl } from '../../bench/geometry.mjs';
import { writePartGlb } from './glb.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = JSON.parse(fs.readFileSync(path.join(here, 'sources.json'), 'utf8'));

const attr = (tag, name) => new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1];
const nums = (s, def) => (s ? s.trim().split(/\s+/).map(Number) : def);

/** Transform from a URDF <origin xyz rpy> (fixed-axis roll-pitch-yaw) */
function originMatrix(tag) {
  const [x, y, z] = nums(tag && attr(tag, 'xyz'), [0, 0, 0]);
  const [r, p, yw] = nums(tag && attr(tag, 'rpy'), [0, 0, 0]);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r, p, yw, 'ZYX'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
}

for (const id of process.argv.slice(2)) {
  const src = SOURCES[id];
  if (!src?.urdf && !src?.mjcf && !src?.mesh) {
    console.error(`${id}: no "urdf", "mjcf" or "mesh" in sources.json`);
    continue;
  }
  const rot = new THREE.Matrix4();
  for (const [axis, deg] of src.rotate ?? []) {
    const r = new THREE.Matrix4()[`makeRotation${axis.toUpperCase()}`]((deg * Math.PI) / 180);
    rot.premultiply(r);
  }
  const groups = new Map();
  const v = new THREE.Vector3();
  /** Adds one mesh file (CAD frame, meters after `m`) in its color */
  const addMesh = (file, m, rgb) => {
    // Simulation models often carry debug colors; "modelColors": false uses defaultColor instead
    const color = src.colors?.[path.basename(file)] ?? (src.modelColors === false ? undefined : rgb) ?? src.defaultColor ?? [0.6, 0.6, 0.62];
    const key = color.map((c) => c.toFixed(3)).join(',');
    if (!groups.has(key)) groups.set(key, { color, soup: [] });
    const soup = groups.get(key).soup;
    const tris = parseStl(fs.readFileSync(path.resolve(here, src.meshDir ?? '.', file)));
    for (let i = 0; i < tris.length; i += 3) {
      v.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(m).multiplyScalar(1000).applyMatrix4(rot);
      soup.push(v.x, v.z, -v.y); // CAD Z-up → studio Y-up
    }
  };
  const finish = (note) => {
    const stat = writePartGlb(id, [...groups.values()], { source: src.url ?? null, triangleBudget: src.triangleBudget, colorMap: src.colorMap });
    console.log(`${id}: ${stat.size.join(' × ')} mm · ${stat.triangles} tris · ${stat.colors} colors${note ? ` (${note})` : ''}`);
  };

  if (src.mesh) {
    const k = src.meshScale ?? 1;
    addMesh(path.resolve(here, src.mesh), new THREE.Matrix4().makeScale(k, k, k));
    finish('fused mesh');
    continue;
  }
  if (src.mjcf) {
    addMjcf(path.resolve(here, src.mjcf), addMesh);
    finish('MJCF');
    continue;
  }
  const xml = fs.readFileSync(path.resolve(here, src.urdf), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

  // Links with their visuals
  const links = new Map();
  for (const m of xml.matchAll(/<link\b([^>]*?)(\/>|>([\s\S]*?)<\/link>)/g)) {
    const name = attr(m[1], 'name');
    const visuals = [];
    for (const v of (m[3] ?? '').matchAll(/<visual\b[\s\S]*?<\/visual>/g)) {
      const mesh = /<mesh\b[^>]*>/.exec(v[0])?.[0];
      if (!mesh) continue;
      visuals.push({
        file: path.basename(attr(mesh, 'filename')),
        scale: nums(attr(mesh, 'scale'), [1, 1, 1]),
        origin: originMatrix(/<origin\b[^>]*>/.exec(v[0])?.[0]),
        rgba: nums(/<color\b[^>]*rgba\s*=\s*"([^"]*)"/.exec(v[0])?.[1], null),
      });
    }
    links.set(name, visuals);
  }
  // Joints at zero: just their origins
  const children = new Map();
  const isChild = new Set();
  for (const m of xml.matchAll(/<joint\b[\s\S]*?<\/joint>/g)) {
    // <transmission> blocks also hold <joint> tags, without parent/child
    const parentTag = /<parent\b[^>]*>/.exec(m[0]);
    const childTag = /<child\b[^>]*>/.exec(m[0]);
    if (!parentTag || !childTag) continue;
    const parent = attr(parentTag[0], 'link');
    const child = attr(childTag[0], 'link');
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push({ child, origin: originMatrix(/<origin\b[^>]*>/.exec(m[0])?.[0]) });
    isChild.add(child);
  }
  // "rootLink" builds just one subtree, e.g. the gripper of a full arm's URDF
  const root = src.rootLink ?? [...links.keys()].find((l) => !isChild.has(l));

  const walk = (link, world) => {
    for (const vis of links.get(link) ?? []) {
      const m = world.clone().multiply(vis.origin).multiply(new THREE.Matrix4().makeScale(...vis.scale));
      addMesh(vis.file, m, vis.rgba ? vis.rgba.slice(0, 3) : undefined);
    }
    for (const j of children.get(link) ?? []) walk(j.child, world.clone().multiply(j.origin));
  };
  walk(root, new THREE.Matrix4());
  finish(`URDF root ${root}`);
}

/**
 * MuJoCo MJCF: nested <body pos quat> with visual mesh <geom pos quat mesh material>, meshes and
 * materials from <asset>. Collision-class geoms are skipped. Quaternions are w x y z.
 */
function addMjcf(file, addMesh) {
  const xml = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const meshes = new Map();
  for (const m of xml.matchAll(/<mesh\b[^>]*>/g)) {
    const f = attr(m[0], 'file');
    if (f) meshes.set(attr(m[0], 'name') ?? path.basename(f).replace(/\.[^.]+$/, ''), { file: f, scale: nums(attr(m[0], 'scale'), [1, 1, 1]) });
  }
  const materials = new Map();
  for (const m of xml.matchAll(/<material\b[^>]*>/g)) materials.set(attr(m[0], 'name'), nums(attr(m[0], 'rgba'), null));
  const pose = (tag) => {
    const p = nums(attr(tag, 'pos'), [0, 0, 0]);
    const [w, x, y, z] = nums(attr(tag, 'quat'), [1, 0, 0, 0]);
    return new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion(x, y, z, w).normalize(), new THREE.Vector3(1, 1, 1));
  };
  const body = xml.slice(xml.indexOf('<worldbody'), xml.indexOf('</worldbody>'));
  const stack = [new THREE.Matrix4()];
  for (const m of body.matchAll(/<(\/?)(body|geom)\b([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (tag === 'body') {
      if (closing) stack.pop();
      else if (!selfClosing) stack.push(stack[stack.length - 1].clone().multiply(pose(attrs)));
      continue;
    }
    if (closing || /class\s*=\s*"collision"/.test(attrs)) continue;
    const mesh = meshes.get(attr(attrs, 'mesh'));
    if (!mesh) continue;
    const rgba = attr(attrs, 'rgba') ? nums(attr(attrs, 'rgba')) : materials.get(attr(attrs, 'material'));
    const m4 = stack[stack.length - 1].clone().multiply(pose(attrs)).multiply(new THREE.Matrix4().makeScale(...mesh.scale));
    addMesh(mesh.file, m4, rgba ? rgba.slice(0, 3) : undefined);
  }
}
