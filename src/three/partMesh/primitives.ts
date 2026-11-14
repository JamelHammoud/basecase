import * as THREE from 'three';
import type { PartEdges } from '../../types/robotics';
import { hexOutline, partEdges, tubeRadii, wedgeOutline } from '../../utils/partEdges';
import type { BuildContext } from './context';
import { edgedLathe, edgedPrism } from './edgedGeometry';

export type PartBuilder = (ctx: BuildContext) => void;

const boxOutline = ({ width, depth }: BuildContext): Array<[number, number]> => [
  [-width / 2, -depth / 2],
  [width / 2, -depth / 2],
  [width / 2, depth / 2],
  [-width / 2, depth / 2],
];

const edged =
  (plain: PartBuilder, build: (ctx: BuildContext, edges: PartEdges) => THREE.BufferGeometry): PartBuilder =>
  (ctx) => {
    const edges = partEdges(ctx.part);

    if (!edges) return plain(ctx);

    ctx.add(ctx.deform(build(ctx, edges)));
  };

const boxShape: PartBuilder = (ctx) => {
  const segments = ctx.deformed ? 16 : 1;

  ctx.add(ctx.deform(new THREE.BoxGeometry(ctx.width, ctx.height, ctx.depth, segments, segments, segments)));
};

const cylinder: PartBuilder = (ctx) => {
  const rx = ctx.width / 2;
  const rz = ctx.depth / 2;
  const geometry = new THREE.CylinderGeometry(rx, rx, ctx.height, 32, ctx.deformed ? 16 : 1);

  geometry.scale(1, 1, rz / Math.max(rx, 0.001));
  ctx.add(ctx.deform(geometry));
};

const pivotAxis: PartBuilder = (ctx) => {
  const { width, height, depth } = ctx;
  const r = Math.max(1.5, Math.min(width, depth) / 2);
  const cone = new THREE.ConeGeometry(r * 1.35, Math.min(10, height * 0.15), 20);
  const ring = new THREE.TorusGeometry(r * 2.4, r * 0.28, 12, 28);

  ctx.add(new THREE.CylinderGeometry(r * 0.45, r * 0.45, height, 20));
  ctx.add(cone).position.y = height / 2;

  const bottom = ctx.add(cone);

  bottom.rotation.x = Math.PI;
  bottom.position.y = -height / 2;
  ctx.add(ring).rotation.x = Math.PI / 2;
};

const tube: PartBuilder = (ctx) => {
  const { outer: outerR, inner: innerR } = tubeRadii(ctx.part.dimensions);
  const shape = new THREE.Shape();
  const hole = new THREE.Path();

  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: ctx.height,
    steps: ctx.deformed ? 14 : 1,
    bevelEnabled: false,
    curveSegments: 32,
  });

  geometry.rotateX(Math.PI / 2);
  geometry.center();
  ctx.add(ctx.deform(geometry));
};

const scaled =
  (make: () => THREE.BufferGeometry): PartBuilder =>
  (ctx) => {
    const geometry = make();

    geometry.scale(ctx.width, ctx.height, ctx.depth);
    ctx.add(ctx.deform(geometry));
  };

const torus: PartBuilder = (ctx) => {
  const tubeR = Math.max(1.5, ctx.height / 2);
  const mainR = Math.max(tubeR + 1, Math.min(ctx.width, ctx.depth) / 2 - tubeR);
  const geometry = new THREE.TorusGeometry(mainR, tubeR, 18, 36);

  geometry.rotateX(Math.PI / 2);
  ctx.add(ctx.deform(geometry));
};

const RADIAL: Record<string, number> = { pyramid: 4, hex_prism: 6, cone: 48 };

const coneLike: PartBuilder = (ctx) => {
  const kind = ctx.part.kind;
  const top = kind === 'hex_prism' ? 0.5 : 0;
  const geometry = new THREE.CylinderGeometry(top, 0.5, 1, RADIAL[kind] ?? 48, ctx.deformed ? 16 : 1);

  if (kind === 'pyramid') {
    geometry.rotateY(Math.PI / 4);
    geometry.scale(ctx.width * Math.SQRT2, ctx.height, ctx.depth * Math.SQRT2);
  } else {
    geometry.scale(ctx.width, ctx.height, ctx.depth);
  }

  ctx.add(ctx.deform(geometry));
};

const capsule: PartBuilder = (ctx) => {
  const geometry = new THREE.CapsuleGeometry(0.5, 1, 12, 32);

  geometry.scale(1, 1 / 2, 1);
  geometry.scale(ctx.width, ctx.height, ctx.depth);
  ctx.add(ctx.deform(geometry));
};

const dome: PartBuilder = (ctx) => {
  const { width, height, depth } = ctx;
  const cap = new THREE.SphereGeometry(0.5, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const base = new THREE.CircleGeometry(0.5, 48);

  base.rotateX(Math.PI / 2);
  cap.scale(width, height * 2, depth);
  cap.translate(0, -height / 2, 0);
  base.scale(width, 1, depth);
  base.translate(0, -height / 2, 0);
  ctx.add(ctx.deform(cap));
  ctx.add(base, undefined, 80);
};

const wedge: PartBuilder = (ctx) => {
  const { width: w, height: h } = ctx;
  const shape = new THREE.Shape();

  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: ctx.depth,
    steps: ctx.deformed ? 12 : 1,
    bevelEnabled: false,
  });

  geometry.center();
  ctx.add(ctx.deform(geometry));
};

const edgedBox = edged(boxShape, (ctx, edges) =>
  edgedPrism({ outline: boxOutline(ctx), height: ctx.height, edges, deformed: ctx.deformed }),
);

const edgedCylinder = edged(cylinder, (ctx, edges) => {
  const rx = ctx.width / 2;
  const geometry = edgedLathe({ radii: rx, height: ctx.height, edges, deformed: ctx.deformed });

  geometry.scale(1, 1, ctx.depth / 2 / Math.max(rx, 0.001));

  return geometry;
});

const edgedTube = edged(tube, (ctx, edges) =>
  edgedLathe({ radii: tubeRadii(ctx.part.dimensions), height: ctx.height, edges, deformed: ctx.deformed }),
);

const edgedHex = edged(coneLike, (ctx, edges) =>
  edgedPrism({ outline: hexOutline(ctx.part.dimensions), height: ctx.height, edges, deformed: ctx.deformed }),
);

const edgedWedge = edged(wedge, (ctx, edges) =>
  edgedPrism({ outline: wedgeOutline(ctx.part.dimensions), height: ctx.depth, edges, deformed: ctx.deformed }).rotateX(
    Math.PI / 2,
  ),
);

export const PRIMITIVE_BUILDERS: Record<string, PartBuilder> = {
  box: edgedBox,
  cube: edgedBox,
  hole_box: boxShape,
  cylinder: edgedCylinder,
  hole_cylinder: cylinder,
  pivot_axis: pivotAxis,
  tube: edgedTube,
  sphere: scaled(() => new THREE.SphereGeometry(0.5, 32, 24)),
  torus,
  cone: coneLike,
  pyramid: coneLike,
  hex_prism: edgedHex,
  capsule,
  dome,
  wedge: edgedWedge,
};
