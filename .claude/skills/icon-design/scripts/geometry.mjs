// Geometry helpers for drawing icons as numbers instead of by eye. Paths come out rounded to 0.01.
export const f = (v) => +v.toFixed(2);

/**
 * A closed polygon with every corner rounded by r (quadratic curves through the original corner).
 * Also returns each corner's on-curve midpoint, where inner lines should start or end so they
 * meet the rounded outline instead of poking past it.
 */
export function roundedPolygon(points, r) {
  const n = points.length, mids = [];
  let d = '';
  points.forEach((p, i) => {
    const a = points[(i + n - 1) % n], b = points[(i + 1) % n];
    const toward = (q) => {
      const v = [q[0] - p[0], q[1] - p[1]], l = Math.hypot(...v);
      return [p[0] + (v[0] / l) * r, p[1] + (v[1] / l) * r];
    };
    const pa = toward(a), pb = toward(b);
    mids.push([0.25 * pa[0] + 0.5 * p[0] + 0.25 * pb[0], 0.25 * pa[1] + 0.5 * p[1] + 0.25 * pb[1]].map(f));
    d += (i ? 'L' : 'M') + pa.map(f).join(' ') + 'Q' + p.map(f).join(' ') + ' ' + pb.map(f).join(' ');
  });
  return { d: d + 'Z', mids };
}

/** An ellipse as one path (so it joins the glyph's single outline path) */
export const ellipse = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}a${rx} ${ry} 0 1 0 ${f(2 * rx)} 0a${rx} ${ry} 0 1 0 ${f(-2 * rx)} 0`;

/** Point `to` pushed further along from→to by k of its length (to run a knockout past an edge) */
export const extend = (from, to, k) => [f(to[0] + (to[0] - from[0]) * k), f(to[1] + (to[1] - from[1]) * k)];

/**
 * The Parts icon: an isometric hex nut. x0..x1 wide, top face half-height h, side thickness t,
 * starting at y = top, corner radius r, hole radii [rx, ry]. Returns the four paths icons.tsx uses.
 */
export function nut({ x0, x1, top, h, t, r, hole }) {
  const q = (x1 - x0) / 4, y0 = top + h, yi = y0 + h, yb = yi + t;
  const A = [x0, y0], D = [x1, y0];
  const ring = [A, [x0 + q, top], [x1 - q, top], D, [x1, y0 + t], [x1 - q, yb], [x0 + q, yb], [x0, y0 + t]];
  const { d, mids } = roundedPolygon(ring, r);
  const I = [f(x0 + q), f(yi)], J = [f(x1 - q), f(yi)];
  return {
    body: d,
    edges: `M${mids[0].join(' ')}L${I.join(' ')}H${J[0]}L${mids[3].join(' ')}M${I.join(' ')}V${mids[6][1]}M${J.join(' ')}V${mids[5][1]}`,
    cuts: `M${extend(I, A, 0.4).join(' ')}L${I.join(' ')}H${J[0]}L${extend(J, D, 0.4).join(' ')}M${I.join(' ')}V24M${J.join(' ')}V24`,
    hole: ellipse(12, y0, hole[0], hole[1]),
  };
}

/** What ships in src/design-system/icons.tsx */
export const NUT_PARAMS = { x0: 1.75, x1: 22.25, top: 2.5, h: 5.4, t: 8.2, r: 1.2, hole: [3.8, 2.1] };
