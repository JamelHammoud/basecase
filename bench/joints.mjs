/** Prints each URDF link's world position at the zero pose (mm; z from the lowest link):  node bench/joints.mjs <robot.urdf> */
import fs from 'node:fs';
import * as THREE from 'three';
import { parseXml } from './geometry.mjs';
const xml = fs.readFileSync(process.argv[2], 'utf8');
const robot = parseXml(xml).children.find((c) => c.tag === 'robot');
const kids = (n, t) => n.children.filter((c) => c.tag === t);
const kid = (n, t) => n.children.find((c) => c.tag === t);
const joints = kids(robot, 'joint');
const childOf = new Map(joints.map((j) => [kid(j, 'child').attrs.link, j]));
const om = (n) => { const o = kid(n, 'origin'); const [x,y,z] = (o?.attrs.xyz ?? '0 0 0').trim().split(/\s+/).map(Number); const [r,p,yw] = (o?.attrs.rpy ?? '0 0 0').trim().split(/\s+/).map(Number); const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r,p,yw,'ZYX')); m.setPosition(x,y,z); return m; };
const W = new Map();
const w = (name) => { if (W.has(name)) return W.get(name); const j = childOf.get(name); const m = j ? w(kid(j,'parent').attrs.link).clone().multiply(om(j)) : new THREE.Matrix4(); W.set(name, m); return m; };
const rows = kids(robot, 'link').map((l) => { const p = new THREE.Vector3().setFromMatrixPosition(w(l.attrs.name)); return [l.attrs.name, p.x*1000, p.y*1000, p.z*1000]; });
const zmin = Math.min(...rows.map((r) => r[3]));
for (const r of rows) console.log(r[0].padEnd(28), r.slice(1).map((v, i) => (i === 2 ? v - zmin : v).toFixed(0).padStart(6)).join(''));
