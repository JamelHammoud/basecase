import * as THREE from 'three';
import { EXTRUSIONS, MISUMI_CORNER_BRACKETS, T_NUTS } from '../data/motionTables';
import type { BuildContext } from './hardwareMesh';
import { circleShape, holePath, prism } from './hardwarePrimitives';
import { extrudeZ, rectShape } from './motionHardwareMesh';

type Extrusion = (typeof EXTRUSIONS)[string];

type V2 = [number, number];

interface Face {
  start: V2;
  along: V2;
  inward: V2;
  length: number;
  slots: number[];
}

const at = (f: Face, t: number, depth: number): V2 => [
  f.start[0] + f.along[0] * t + f.inward[0] * depth,
  f.start[1] + f.along[1] * t + f.inward[1] * depth,
];

function slotPoints(e: Extrusion, f: Face, c: number): V2[] {
  const open = e.slotOpening / 2;
  const cavity = e.undercutWidth / 2;
  const core = e.coreWidth / 2;

  return [
    at(f, c - open, 0),
    at(f, c - open, e.lipThickness),
    at(f, c - cavity, e.lipThickness),
    at(f, c - core, e.slotDepth),
    at(f, c + core, e.slotDepth),
    at(f, c + cavity, e.lipThickness),
    at(f, c + open, e.lipThickness),
    at(f, c + open, 0),
  ];
}

function faces(e: Extrusion): Face[] {
  const [w, d] = e.size;
  const { shortFace, longFace } = e.slotCentres;

  return [
    { start: [-w / 2, -d / 2], along: [1, 0], inward: [0, 1], length: w, slots: shortFace },
    { start: [w / 2, -d / 2], along: [0, 1], inward: [-1, 0], length: d, slots: longFace },
    { start: [w / 2, d / 2], along: [-1, 0], inward: [0, -1], length: w, slots: shortFace },
    { start: [-w / 2, d / 2], along: [0, -1], inward: [1, 0], length: d, slots: longFace },
  ];
}

function cornerArc(f: Face, r: number): V2[] {
  const corner = at(f, f.length, 0);
  const center: V2 = [corner[0] - f.along[0] * r + f.inward[0] * r, corner[1] - f.along[1] * r + f.inward[1] * r];
  const a0 = Math.atan2(-f.inward[1], -f.inward[0]);

  return [0, 1, 2, 3, 4].map((i) => {
    const a = a0 + (i / 4) * (Math.PI / 2);

    return [center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r];
  });
}

export function extrusionProfile(e: Extrusion): THREE.Shape {
  const r = e.cornerRadius;
  const points: V2[] = [];

  for (const f of faces(e)) {
    points.push(at(f, r, 0));

    for (const c of f.slots) points.push(...slotPoints(e, f, c));

    points.push(...cornerArc(f, r));
  }

  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const [w, d] = e.size;
  const hole = (x: number, y: number, dia: number) => {
    const p = holePath(dia / 2, 24);

    shape.holes.push(new THREE.Path(p.getPoints().map((v) => new THREE.Vector2(v.x + x, v.y + y))));
  };

  for (const b of e.bores) hole(b.at[0] - w / 2, b.at[1] - d / 2, b.diameter);

  const ch = e.cornerHoles;

  if (ch)
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ])
      hole((sx * ch.pitch) / 2, (sy * ch.pitch) / 2, ch.diameter);

  return shape;
}

function extrusion({ spec, L, add }: BuildContext) {
  add(prism(extrusionProfile(EXTRUSIONS[spec.size]), L, 0));
}

function tNut(slot: keyof typeof T_NUTS) {
  return ({ spec, add }: BuildContext) => {
    const n = T_NUTS[slot];
    const d = Number(spec.size.slice(1));
    const layer = (width: number) => {
      const s = rectShape(-width / 2, -n.length / 2, width / 2, n.length / 2);

      s.holes.push(holePath(d / 2, 24));

      return s;
    };

    add(prism(layer(n.width), n.bodyHeight, 0));
    add(prism(layer(n.tongueWidth), n.height - n.bodyHeight, n.bodyHeight));
  };
}

function cornerBracket({ spec, m, add }: BuildContext) {
  const b = MISUMI_CORNER_BRACKETS[spec.size];
  const tip = b.legTipHeight;
  const profile = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(b.legBase, 0),
    new THREE.Vector2(b.legBase, tip),
    new THREE.Vector2(tip, b.legUpright),
    new THREE.Vector2(0, b.legUpright),
  ]);
  const body = extrudeZ(profile, b.width);

  body.translate(-b.legBase / 2, 0, 0);
  add(body);

  const r = b.holeDiameter / 2;

  for (const x of b.baseHoles) {
    const g = prism(circleShape(r), 0.2, -0.005);

    g.translate(x - b.legBase / 2, 0, 0);
    add(g, m.dark, false);
  }

  for (const y of b.uprightHoles) {
    const g = prism(circleShape(r), 0.2, -0.005);

    g.rotateZ(-Math.PI / 2);
    g.translate(-b.legBase / 2, y, 0);
    add(g, m.dark, false);
  }
}

export const FRAME_BUILDERS = {
  extrusion,
  t_nut: tNut('slot6'),
  t_nut_8: tNut('slot8'),
  corner_bracket: cornerBracket,
};
