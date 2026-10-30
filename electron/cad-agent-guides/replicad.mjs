import { REPLICAD_FILLET, REPLICAD_LOFT } from './examples.mjs';

const indent = (code) => code.replace(/^/gm, '  ');

export const replicad = {
  name: 'replicad',
  use: 'replicad lofts, fillets after booleans, sign traps',
  text: `
Use replicad for lofts, fillets on edges a boolean created, and B-rep shells. Return the shape.
- Fillet AFTER each boolean, picking the new edges with finders (newEdges and convexEdges help),
  and fall back to a smaller radius when a fillet fails:
${indent(REPLICAD_FILLET)}
- Planes: 'XY' and 'YZ' sit at +offset and extrude along +Z / +X; 'XZ' sits at y = −offset and
  extrudes toward −Y, and edge finders use the same sign. Build cutters at the origin and
  translate them to avoid the trap.
- Lofts through sections at their heights:
${indent(REPLICAD_LOFT)}
- Traced outlines: drawPointsInterpolation([...pts, pts[0]]) makes a closed spline. Extrude a
  front outline on 'XZ' and a side outline on 'YZ' just past each other (twice the largest
  coordinate plus 20 mm; huge spans break OpenCascade's precision) and intersect. Booleans of
  spline solids sometimes come back empty: rotate the point list (move the seam) and retry.
- shell() on spline bodies and deep cuts can fail silently: check the returned bounding box and
  volume after each step.
- Ellipsoids: makeEllipsoid(rx, ry, rz).
- After two failures on one part, rebuild it in OpenSCAD.`,
};
