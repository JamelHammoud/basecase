import { facetedSolid } from './stepFacets.mjs';

export function trsfOf(oc, matrix) {
  const trsf = new oc.gp_Trsf();

  trsf.SetValues(...matrix);

  return trsf;
}

const moved = (oc, shape, matrix) => new oc.BRepBuilderAPI_Transform(shape, trsfOf(oc, matrix), true, false).Shape();

function ellipticCylinder(r, [a, b], height) {
  const lift = [0, 0, -height / 2];

  if (a === b) return r.makeCylinder(a, height, lift);

  const turned = a < b;
  const sketch = r.drawEllipse(Math.max(a, b), Math.min(a, b));

  return (turned ? sketch.rotate(90) : sketch).sketchOnPlane('XY', lift).extrude(height);
}

const revolved = (drawing) => drawing.close().sketchOnPlane('XZ').revolve();

const arcTo = (drawing, end, [across, up]) => drawing.ellipseTo(end, up, across, 90, false, true);

function capsule(r, { radius, height }) {
  const cap = height / 4;
  const radii = [radius, cap];

  return revolved(
    arcTo(arcTo(r.draw([0, -height / 2]), [radius, -cap], radii).lineTo([radius, cap]), [0, height / 2], radii),
  );
}

const PRIMITIVES = {
  box: (r, { size: [x, y, z] }) => r.makeBox([-x / 2, -y / 2, -z / 2], [x / 2, y / 2, z / 2]),
  cylinder: (r, { radii, height }) => ellipticCylinder(r, radii, height),
  sphere: (r, { radius }) => r.makeSphere(radius),
  cone: (r, { radius, height }) =>
    revolved(
      r
        .draw([0, -height / 2])
        .lineTo([radius, -height / 2])
        .lineTo([0, height / 2]),
    ),
  dome: (r, { radius, height }) =>
    revolved(arcTo(r.draw([0, -height / 2]).lineTo([radius, -height / 2]), [0, height / 2], [radius, height])),
  capsule,
  torus: (r, { major, minor }) => r.drawCircle(minor).translate(major, 0).sketchOnPlane('XZ').revolve(),
};

const BOOLEANS = {
  union: (a, b) => a.fuse(b),
  subtract: (a, b) => a.cut(b),
  intersect: (a, b) => a.intersect(b),
};

export function createSolidBuilder({ api, shapeOfCode, facetShare }) {
  const { oc, replicad } = api;

  async function wrapped(solid) {
    return replicad.cast(await raw(solid));
  }

  async function raw(solid) {
    if (Object.hasOwn(PRIMITIVES, solid.type)) return PRIMITIVES[solid.type](replicad, solid).wrapped;

    if (solid.type === 'mesh') return facetedSolid(api, solid, facetShare);

    if (solid.type === 'code') return (await shapeOfCode(solid.code)).wrapped;

    if (solid.type === 'moved') return moved(oc, await raw(solid.solid), solid.matrix);

    let result = await wrapped(solid.solids[0]);

    for (const next of solid.solids.slice(1)) result = BOOLEANS[solid.op](result, await wrapped(next));

    return result.wrapped;
  }

  return { build: raw };
}
