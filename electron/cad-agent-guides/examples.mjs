export const SILHOUETTE_SHELL = `include <robotics.scad>
H = 200; W = 0.78 * H; D = 0.7 * H; R = 0.12 * W; wall = 2.5;
front = [[-0.5 * W, 0], [0.5 * W, 0], [0.5 * W, 0.7 * H], [0.3 * W, H], [-0.3 * W, H], [-0.5 * W, 0.7 * H]];
side = [[-0.5 * D, 0], [0.5 * D, 0], [0.45 * D, 0.85 * H], [0.2 * D, H], [-0.4 * D, H], [-0.5 * D, 0.6 * H]];
module soft(r) offset(r = r) offset(delta = -r) children();
module body(inset = 0) intersection() {
  rot([90, 0, 0]) linear_extrude(height = 2 * D, center = true) soft(R) offset(delta = -inset) polygon(front);
  rot([90, 0, 90]) linear_extrude(height = 2 * W, center = true) soft(R) offset(delta = -inset) polygon(side);
}
difference() { body(); body(wall); }`;

export const TAPERED_LIMB = `include <robotics.scad>
L = 160; w0 = 0.36 * L; d0 = 0.4 * L; w1 = 0.28 * L; d1 = 0.31 * L;
diff() prismoid(size1 = [w0, d0], size2 = [w1, d1], h = L, rounding = 0.25 * min(w1, d1), anchor = BOT)
  edge_profile([TOP, BOT]) mask2d_roundover(r = 0.04 * L);`;

export const EGG_HEAD = `include <robotics.scad>
w = 150; d = 0.9 * w; h = 1.2 * w;
scale([1, d / w, h / w]) spheroid(d = w, $fn = 64);`;

export const REPLICAD_FILLET = `const soften = (shape, radius, pick) => {
  for (const k of [1, 0.6, 0.35]) {
    try { return shape.fillet(radius * k, pick); } catch (err) { if (k === 0.35) return shape; }
  }
  return shape;
};
let body = drawRoundedRectangle(40, 30, 6).sketchOnPlane('XY').extrude(20);
body = body.fuse(makeCylinder(5, 8, [0, 0, 19.5]));
body = soften(body, 2, (e) => e.inPlane('XY', 20));
return body;`;

export const REPLICAD_LOFT = `const a = drawRoundedRectangle(40, 30, 10).sketchOnPlane('XY', 0);
const b = drawRoundedRectangle(46, 34, 12).sketchOnPlane('XY', 60);
const c = drawRoundedRectangle(30, 24, 8).sketchOnPlane('XY', 140);
return a.loftWith([b, c], { ruled: false });`;

export const GUIDE_EXAMPLES = {
  openscad: [SILHOUETTE_SHELL, TAPERED_LIMB, EGG_HEAD],
  replicad: [REPLICAD_FILLET, REPLICAD_LOFT],
};
