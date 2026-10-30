import { EGG_HEAD, SILHOUETTE_SHELL, TAPERED_LIMB } from './examples.mjs';

const indent = (code) => code.replace(/^/gm, '  ');

export const shells = {
  name: 'shells',
  use: 'heads, torsos, limb covers, bases and other sculpted shells',
  text: `
Real robots are sculpted: limbs taper, torsos flare or narrow to the waist, heads are capsules
and eggs, covers wrap around actuators. Take every size from your reference sheet; the numbers
below are ratios, never sizes to copy, and the outlines are placeholders for your own traces.
- Shell from two silhouettes (the default; OpenSCAD): take the front outline (x, z) and the
  side outline (y, z; front = −y) from the photos as 12–24 points in mm (trace_outline returns
  them from a photo, already in mm, with the gap to your model per band), soften them in 2D,
  extrude each through the other and intersect. Hollow it with an inset copy.
${indent(SILHOUETTE_SHELL)}
  Add a top outline (a third extrusion) when the plan view is rounded.
- Tapered limb or torso (L = the link length from your reference sheet):
${indent(TAPERED_LIMB)}
- Capsule or egg head (w, d, h from the reference sheet); a big-radius cuboid only when the
  photo shows flat parallel sides:
${indent(EGG_HEAD)}
- Smooth transitions through three or more sections need a replicad loft (the replicad guide).
- Covers over actuators: a round joint cover flush with the link shell, not a cylinder stuck on.
- Seams: split a shell along its removal direction (check_assembly suggests the plane), show the
  split as a 0.3–0.6 mm reveal or a lip, and put bosses for the seam screws on the inside
  (find_recipes "shell seam").
Check each shell with compare at the photo's angle and check the returned bounding box; a big
drop in hull volume or a rising body count means a boolean went wrong.`,
};
