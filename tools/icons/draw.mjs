export const f = (v) => +(+v).toFixed(2);
export const pt = (p) => `${f(p[0])} ${f(p[1])}`;

const rad = (a) => (a * Math.PI) / 180;

export const polar = (c, r, a) => [c[0] + r * Math.cos(rad(a)), c[1] + r * Math.sin(rad(a))];

export const rr = ([x, y, w, h], r) =>
  `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${r} ${r} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${r} ${r} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${r} ${r} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)}Z`;

export const circle = (cx, cy, r) =>
  `M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0`;
export const ellipse = (cx, cy, rx, ry) =>
  `M${f(cx - rx)} ${f(cy)}a${rx} ${ry} 0 1 0 ${f(2 * rx)} 0a${rx} ${ry} 0 1 0 ${f(-2 * rx)} 0`;

export function rounded(points, radii, closed = true) {
  const n = points.length;
  const r = (i) => (Array.isArray(radii) ? radii[i] : radii);
  let d = '';

  points.forEach((p, i) => {
    const isEnd = !closed && (i === 0 || i === n - 1);

    if (isEnd || !r(i)) {
      d += (i ? 'L' : 'M') + pt(p);

      return;
    }

    const a = points[(i + n - 1) % n],
      b = points[(i + 1) % n];
    const toward = (q) => {
      const v = [q[0] - p[0], q[1] - p[1]],
        l = Math.hypot(...v);

      return [p[0] + (v[0] / l) * r(i), p[1] + (v[1] / l) * r(i)];
    };

    d += (i ? 'L' : 'M') + pt(toward(a)) + 'Q' + pt(p) + ' ' + pt(toward(b));
  });

  return closed ? d + 'Z' : d;
}

export const frame = (origin, angle) => {
  const c = Math.cos(rad(angle)),
    s = Math.sin(rad(angle));

  return ([x, y]) => [origin[0] + x * c - y * s, origin[1] + x * s + y * c];
};

export function head(tip, dir, arm = 3.75) {
  const l = Math.hypot(...dir),
    u = [dir[0] / l, dir[1] / l];
  const back = (a) => {
    const c = Math.cos(rad(a)),
      s = Math.sin(rad(a));

    return [tip[0] - arm * (u[0] * c - u[1] * s), tip[1] - arm * (u[0] * s + u[1] * c)];
  };

  return `M${pt(back(45))}L${pt(tip)}L${pt(back(-45))}`;
}

export function loopArrow({ c, r, ry = r, from, to, cw = true, tail = 2.25, arm = 3.75 }) {
  const p = (a) => [c[0] + r * Math.cos(rad(a)), c[1] + ry * Math.sin(rad(a))];
  const span = Math.abs(to - from);
  const s = cw ? 1 : -1;
  const t = [-r * Math.sin(rad(to)) * s, ry * Math.cos(rad(to)) * s];
  const l = Math.hypot(...t),
    u = [t[0] / l, t[1] / l];
  const end = p(to),
    tip = [end[0] + u[0] * tail, end[1] + u[1] * tail];

  return `M${pt(p(from))}A${r} ${ry} 0 ${span > 180 ? 1 : 0} ${cw ? 1 : 0} ${pt(end)}L${pt(tip)}` + head(tip, u, arm);
}

const ARITY = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

function shiftParam(cmd, i, v, [dx, dy]) {
  const k = i % ARITY[cmd];

  if (cmd === 'H') return v + dx;

  if (cmd === 'V') return v + dy;

  if (cmd === 'A' && k === 5) return v + dx;

  if (cmd === 'A' && k === 6) return v + dy;

  if (cmd === 'A') return v;

  return k % 2 ? v + dy : v + dx;
}

export function translatePath(d, by) {
  let out = '';

  for (const [, cmd, params] of d.matchAll(/([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g)) {
    const nums = [...params.matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g)].map((m) => +m[0]);
    const abs = cmd === cmd.toUpperCase() && cmd !== 'Z';

    out += cmd + nums.map((v, i) => f(abs ? shiftParam(cmd, i, v, by) : v)).join(' ');
  }

  return out;
}

export function nudge(spec, by) {
  if (typeof spec === 'string') return translatePath(spec, by);

  const moved = { ...spec };

  for (const key of ['d', 'dots', 'dash', 'cut', 'over']) if (spec[key]) moved[key] = translatePath(spec[key], by);

  return moved;
}
