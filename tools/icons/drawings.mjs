import { f, pt, circle, rounded, frame, polar } from './draw.mjs';

export function pencil({ tip, len, w, cone }) {
  const S = Math.SQRT1_2,
    u = [S, -S],
    n = [S, S];
  const at = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
  const a1 = at(at(tip, u, cone), n, w),
    a2 = at(at(tip, u, cone), n, -w);
  const e = at(tip, u, len);

  return `M${pt(tip)}L${pt(a1)}L${pt(at(e, n, w))}A${w} ${w} 0 0 0 ${pt(at(e, n, -w))}L${pt(a2)}Z`;
}

export function gear() {
  const pts = [];

  for (let k = 0; k < 8; k++) {
    const a = k * 45 - 90;

    pts.push(
      polar([12, 12], 7.4, a - 17),
      polar([12, 12], 9.75, a - 9),
      polar([12, 12], 9.75, a + 9),
      polar([12, 12], 7.4, a + 17),
    );
  }

  return rounded(pts, 0.9) + circle(12, 12, 3.25);
}

export function badge() {
  const pts = [];

  for (let k = 0; k < 16; k++) pts.push(polar([12, 12], k % 2 ? 8.1 : 10, k * 22.5 - 90));

  return rounded(pts, 1.6);
}

export function capsule() {
  const g = frame([12, 12], -45),
    r = 4.25,
    h = 9.5 - r;

  return `M${pt(g([-h, -r]))}L${pt(g([h, -r]))}A${r} ${r} 0 0 1 ${pt(g([h, r]))}L${pt(g([-h, r]))}A${r} ${r} 0 0 1 ${pt(g([-h, -r]))}ZM${pt(g([0, -r]))}L${pt(g([0, r]))}`;
}

export function eraser({ c = [12.5, 12.25], L = 9, w = 5, floor = 21, split = 0.4 } = {}) {
  const g = frame(c, -45);
  const corners = [
    [-L, -w],
    [L, -w],
    [L, w],
    [-L, w],
  ].map(g);
  const out = [];
  const cuts = [];

  corners.forEach((p, i) => {
    const q = corners[(i + 1) % 4];

    if (p[1] <= floor) out.push(p);

    if ((p[1] - floor) * (q[1] - floor) < 0) {
      const t = (floor - p[1]) / (q[1] - p[1]);
      const x = [p[0] + t * (q[0] - p[0]), floor];

      out.push(x);
      cuts.push(x);
    }
  });

  const radii = out.map((p) => (cuts.includes(p) ? 0 : 2));
  const [s0, s1] = [
    [-L + 2 * L * split, -w],
    [-L + 2 * L * split, w],
  ].map(g);
  const right = Math.max(...cuts.map((p) => p[0]));

  return rounded(out, radii) + `M${pt(s0)}L${pt(s1)}M${f(right)} ${floor}H21`;
}

export function marker() {
  const g = frame([3.25, 19.25], -45);
  const body = rounded(
    [
      [0, -1.25],
      [5, -4],
      [21.25, -4],
      [21.25, 4],
      [5, 4],
      [0, 2.25],
    ].map(g),
    [0.75, 1.5, 2.5, 2.5, 1.5, 0.75],
  );
  const [b0, b1] = [
    [10, -4],
    [10, 4],
  ].map(g);

  return body + `M${pt(b0)}L${pt(b1)}M12.5 21.25H21`;
}

export function pen() {
  const k = 1.15;
  const g = frame([11, 13], 45);
  const at = (pts) => pts.map(([x, y]) => g([x * k, y * k]));
  const [tip, l1, l2, r2, r1] = at([
    [0, 9],
    [-6.75, 0],
    [-3.75, -5.75],
    [3.75, -5.75],
    [6.75, 0],
  ]);
  const [h0, h1, dot] = at([
    [-3.75, -9.25],
    [3.75, -9.25],
    [0, 0],
  ]);
  const body = rounded([tip, l1, l2, r2, r1], [0.75, 3.15, 1, 1, 3.15]);

  return { d: body + `M${pt(tip)}L${pt(dot)}M${pt(h0)}L${pt(h1)}`, dots: `M${pt(dot)}h0`, dotSize: 4.25 };
}

export function eyedropper() {
  const g = frame([3.25, 20.75], -45);
  const tube = rounded(
    [
      [0, 0],
      [3, -2.5],
      [12, -2.5],
      [12, 2.5],
      [3, 2.5],
    ].map(g),
    [0.6, 1.25, 0, 0, 1.25],
  );
  const [c0, c1] = [
    [12, -5],
    [12, 5],
  ].map(g);
  const bulb = rounded(
    [
      [12, -3.5],
      [23, -3.5],
      [23, 3.5],
      [12, 3.5],
    ].map(g),
    [0, 3.5, 3.5, 0],
  );

  return tube + `M${pt(c0)}L${pt(c1)}` + bulb;
}

export function brush() {
  const g = frame([3, 20], -45);
  const tip = g([0, 1.5]);
  const bristles = `M${pt(tip)}Q${pt(g([2.63, -3.75]))} ${pt(g([7.5, -3.5]))}L${pt(g([7.5, 3.5]))}Q${pt(g([2.63, 3.75]))} ${pt(tip)}Z`;
  const ferrule = rounded(
    [
      [7.5, -3.5],
      [10.75, -3.25],
      [10.75, 3.25],
      [7.5, 3.5],
    ].map(g),
    [0, 1, 1, 0],
  );
  const handle = rounded(
    [
      [10.75, -2.25],
      [22, -1.75],
      [23.75, 0],
      [22, 1.75],
      [10.75, 2.25],
    ].map(g),
    [0, 1.58, 1.75, 1.58, 0],
  );

  return bristles + ferrule + handle;
}

export function scissors() {
  const a = [6, 6.5],
    b = [6, 17.5],
    r = 3;
  const towards = (c, q) => {
    const v = [q[0] - c[0], q[1] - c[1]],
      l = Math.hypot(...v);

    return [c[0] + (v[0] / l) * r, c[1] + (v[1] / l) * r];
  };

  return (
    circle(...a, r) +
    circle(...b, r) +
    `M${pt(towards(a, [20.5, 19.5]))}L20.5 19.5M${pt(towards(b, [20.5, 4.5]))}L20.5 4.5`
  );
}

export function sparkle([x, y], r, k = 0.12) {
  const q = r * k;

  return `M${f(x)} ${f(y - r)}Q${f(x + q)} ${f(y - q)} ${f(x + r)} ${f(y)}Q${f(x + q)} ${f(y + q)} ${f(x)} ${f(y + r)}Q${f(x - q)} ${f(y + q)} ${f(x - r)} ${f(y)}Q${f(x - q)} ${f(y - q)} ${f(x)} ${f(y - r)}Z`;
}
