function parseXml(xml) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m;

  while ((m = re.exec(xml))) {
    if (m[1] && stack.length > 1) stack.pop();

    if (m[1] || !m[2]) continue;

    const attrs = {};

    for (const a of m[3].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = a[2] ?? a[3];

    const node = { tag: m[2], attrs, children: [] };

    stack[stack.length - 1].children.push(node);

    if (!m[4]) stack.push(node);
  }

  return root;
}

const kids = (n, tag) => n.children.filter((c) => c.tag === tag);
const kid = (n, tag) => n.children.find((c) => c.tag === tag);
const nums = (s, def) => (s ? s.trim().split(/\s+/).map(Number) : def);

const I = () => ({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
const mulR = (a, b) => {
  const r = new Array(9);

  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];

  return r;
};
const apply = (R, v) => [0, 1, 2].map((i) => R[i * 3] * v[0] + R[i * 3 + 1] * v[1] + R[i * 3 + 2] * v[2]);
const compose = (a, b) => ({ R: mulR(a.R, b.R), t: apply(a.R, b.t).map((v, i) => v + a.t[i]) });
const rx = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const ry = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rz = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const quatR = ([w, x, y, z]) => {
  const n = Math.hypot(w, x, y, z) || 1;

  [w, x, y, z] = [w / n, x / n, y / n, z / n];

  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - w * z),
    2 * (x * z + w * y),
    2 * (x * y + w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z - w * x),
    2 * (x * z - w * y),
    2 * (y * z + w * x),
    1 - 2 * (x * x + y * y),
  ];
};

function urdfSkeleton(doc) {
  const robot = kid(doc, 'robot');
  const joints = kids(robot, 'joint');
  const origin = (n) => {
    const o = kid(n, 'origin');
    const [r, p, y] = nums(o?.attrs.rpy, [0, 0, 0]);

    return { R: mulR(rz(y), mulR(ry(p), rx(r))), t: nums(o?.attrs.xyz, [0, 0, 0]) };
  };
  const byChild = new Map(joints.map((j) => [kid(j, 'child')?.attrs.link, j]));
  const world = new Map();
  const worldOf = (link, depth = 0) => {
    if (world.has(link)) return world.get(link);

    const j = byChild.get(link);
    const w = j && depth < 200 ? compose(worldOf(kid(j, 'parent').attrs.link, depth + 1), origin(j)) : I();

    world.set(link, w);

    return w;
  };
  const out = joints.map((j) => {
    const parent = kid(j, 'parent').attrs.link;
    const child = kid(j, 'child').attrs.link;
    const w = worldOf(child);
    const pj = byChild.get(parent);

    return {
      name: j.attrs.name,
      type: j.attrs.type,
      parent,
      child,
      parentJoint: pj?.attrs.name,
      pos: w.t,
      axis: j.attrs.type === 'fixed' ? null : apply(w.R, nums(kid(j, 'axis')?.attrs.xyz, [1, 0, 0])),
      limit: kid(j, 'limit')
        ? [Number(kid(j, 'limit').attrs.lower), Number(kid(j, 'limit').attrs.upper)].map((v) => (v * 180) / Math.PI)
        : null,
    };
  });

  return { kind: 'URDF', name: robot.attrs.name, links: kids(robot, 'link').length, joints: out, unit: 1000 };
}

function mjcfSkeleton(doc) {
  const mj = kid(doc, 'mujoco');
  const compiler = kid(mj, 'compiler')?.attrs ?? {};
  const deg = (compiler.angle ?? 'degree') === 'degree';
  const seq = compiler.eulerseq ?? 'xyz';
  const toRad = (a) => (deg ? (a * Math.PI) / 180 : a);
  const frame = (n) => {
    const a = n.attrs;
    let R = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    if (a.quat) R = quatR(nums(a.quat));
    else if (a.euler) {
      const e = nums(a.euler).map(toRad);
      const rot = { x: rx, y: ry, z: rz };

      for (let i = 0; i < 3; i++) {
        const c = seq[i];
        const r = rot[c.toLowerCase()](e[i]);

        R = c === c.toLowerCase() ? mulR(R, r) : mulR(r, R);
      }
    } else if (a.axisangle) {
      const [x, y, z, ang] = nums(a.axisangle);
      const n2 = Math.hypot(x, y, z) || 1;
      const h = toRad(ang) / 2;

      R = quatR([Math.cos(h), (x / n2) * Math.sin(h), (y / n2) * Math.sin(h), (z / n2) * Math.sin(h)]);
    }

    return { R, t: nums(a.pos, [0, 0, 0]) };
  };
  const out = [];
  let bodies = 0;
  const walk = (node, parentW, parentName, parentJoint) => {
    for (const body of kids(node, 'body')) {
      bodies++;

      const w = compose(parentW, frame(body));
      const name = body.attrs.name ?? `body${bodies}`;
      const js = [...kids(body, 'joint'), ...kids(body, 'freejoint')];
      let last = parentJoint;

      if (!js.length) {
        out.push({
          name: `(${name})`,
          type: 'fixed',
          parent: parentName,
          child: name,
          parentJoint,
          pos: w.t,
          axis: null,
          limit: null,
        });
        last = `(${name})`;
      }

      for (const j of js) {
        const free = j.tag === 'freejoint' || j.attrs.type === 'free';
        const jn = j.attrs.name ?? `${name}_joint`;

        out.push({
          name: jn,
          type: free ? 'floating' : (j.attrs.type ?? 'hinge'),
          parent: parentName,
          child: name,
          parentJoint,
          pos: apply(w.R, nums(j.attrs.pos, [0, 0, 0])).map((v, i) => v + w.t[i]),
          axis: free ? null : apply(w.R, nums(j.attrs.axis, [0, 0, 1])),
          limit: j.attrs.range ? nums(j.attrs.range).map((v) => (deg ? v : (v * 180) / Math.PI)) : null,
        });
        last = jn;
      }

      walk(body, w, name, last);
    }
  };

  walk(kid(mj, 'worldbody'), I(), 'world', undefined);

  return { kind: 'MJCF', name: mj.attrs.model, links: bodies, joints: out, unit: 1000 };
}

function sourceSkeleton(doc) {
  if (kid(doc, 'robot')) return urdfSkeleton(doc);

  if (kid(doc, 'mujoco')) return mjcfSkeleton(doc);

  return null;
}

export function skeletonFromXml(xml, forward = '+x') {
  const doc = parseXml(xml);
  const sk = sourceSkeleton(doc);

  if (!sk) throw new Error('Not a URDF (<robot>) or MJCF (<mujoco>) file.');

  const f = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0] }[forward] ?? [1, 0, 0];
  const left = [-f[1], f[0], 0];
  const toStudio = (v, scale) => [
    scale * (v[0] * left[0] + v[1] * left[1]),
    -scale * (v[0] * f[0] + v[1] * f[1]),
    scale * v[2],
  ];
  const joints = sk.joints.map((j) => ({ ...j, pos: toStudio(j.pos, sk.unit), axis: j.axis && toStudio(j.axis, 1) }));
  const zMin = Math.min(...joints.map((j) => j.pos[2]));

  for (const j of joints) j.pos[2] -= zMin;

  const byName = new Map(joints.map((j) => [j.name, j]));

  for (const j of joints) {
    const p = j.parentJoint && byName.get(j.parentJoint);

    j.delta = p ? j.pos.map((v, i) => v - p.pos[i]) : null;
    j.fromParent = p ? Math.hypot(...j.delta) : null;
  }

  return { ...sk, joints, forward };
}

const fmt = (v) => v.map((x) => (Math.abs(x) < 0.05 ? '0' : x.toFixed(Math.abs(x) < 10 ? 1 : 0))).join(', ');
const fmtAxis = (a) => {
  const names = ['X', 'Y', 'Z'];
  const i = a.map(Math.abs).indexOf(Math.max(...a.map(Math.abs)));

  return Math.abs(a[i]) > 0.999 ? `${a[i] > 0 ? '+' : '−'}${names[i]}` : `(${a.map((x) => x.toFixed(2)).join(', ')})`;
};

export function describeSkeleton(sk, max = 150) {
  const moving = sk.joints.filter((j) => !/dummy/i.test(j.name));
  const all = sk.joints;
  const ext = [0, 1, 2].map((k) => [Math.min(...all.map((j) => j.pos[k])), Math.max(...all.map((j) => j.pos[k]))]);
  const lines = [
    `${sk.kind} "${sk.name ?? 'robot'}": ${sk.links} ${sk.kind === 'URDF' ? 'links' : 'bodies'}, ${moving.length} moving joints, zero pose.`,
    `Studio frame: mm, Z up, front −Y, left +X (assuming the source faces ${sk.forward}; if the photo disagrees, call again with another forward).`,
    `z = 0 is the lowest joint/frame; soles and covers usually extend a little below it and the shells above the top joints.`,
    `A joint's coordinate ALONG its own axis marks where its frame sits on the axis line. When the left and right joints agree in magnitude (e.g. ±160), it is real geometry: build to it (stance and hip width). When they disagree (e.g. 109 vs −72), the CAD export put the frames on different faces; take that coordinate from the photo instead.`,
    `Joint extents: X ${ext[0].map(Math.round).join('…')}, Y ${ext[1].map(Math.round).join('…')}, Z ${ext[2].map(Math.round).join('…')}.`,
    '',
    'joint [type] parent → child | position (x, y, z) | axis | offset from parent joint',
  ];

  for (const j of all.slice(0, max)) {
    lines.push(
      `${j.name} [${j.type}] ${j.parent} → ${j.child} | ${fmt(j.pos)} | ${j.axis ? fmtAxis(j.axis) : '—'} | ${j.delta ? `Δ ${fmt(j.delta)} (${j.fromParent.toFixed(1)} mm)` : '—'}${j.limit ? ` | range ${j.limit.map((v) => Math.round(v)).join('…')}°` : ''}`,
    );
  }

  if (all.length > max) lines.push(`… ${all.length - max} more`);

  return lines.join('\n');
}

export async function fetchSkeleton(url, forward) {
  let u = new URL(url);

  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs.');

  if (u.hostname === 'github.com' && u.pathname.includes('/blob/')) {
    u = new URL(`https://raw.githubusercontent.com${u.pathname.replace('/blob/', '/')}`);
  }

  const res = await fetch(u, { signal: AbortSignal.timeout(20000), redirect: 'follow' });

  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status} for ${u}`);

  const len = Number(res.headers.get('content-length') || 0);

  if (len > 12e6) throw new Error('File is larger than 12 MB.');

  const xml = await res.text();

  if (xml.length > 12e6) throw new Error('File is larger than 12 MB.');

  return skeletonFromXml(xml, forward);
}

function bestLift(costAt) {
  let best = Infinity;
  let lift = 0;

  for (let l = 0; l <= 120; l += 2) {
    const c = costAt(l);

    if (c < best - 1e-6) [best, lift] = [c, l];
  }

  return lift;
}

export function checkAgainstSkeleton(sk, parts, floorOffset) {
  const zMin = Math.min(...parts.map((p) => p.bounds.min[2]));
  const lowest = Math.min(...sk.joints.map((j) => j.pos[2]));
  const dist = (b, p) => Math.hypot(...[0, 1, 2].map((k) => Math.max(b.min[k] - p[k], 0, p[k] - b.max[k])));
  const moving = sk.joints.filter((j) => !/dummy/i.test(j.name));
  const place = (lift) => moving.map((j) => ({ ...j, p: [j.pos[0], j.pos[1], j.pos[2] - lowest + zMin + lift] }));
  const cost = (js) => js.reduce((t, j) => t + Math.min(...parts.map((p) => dist(p.bounds, j.p))), 0);
  const lift = floorOffset === undefined ? bestLift((l) => cost(place(l))) : (floorOffset ?? 0);
  const joints = place(lift);
  const along = (j) => (j.axis ? j.axis.map(Math.abs).indexOf(Math.max(...j.axis.map(Math.abs))) : -1);
  const partnerDisagrees = (j) => {
    const k = along(j);

    if (k < 0) return false;

    const dot = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    const partner = joints.find(
      (o) =>
        o !== j &&
        o.axis &&
        dot(o.axis, j.axis) > 0.9 &&
        Math.abs(j.p[0]) > 3 &&
        [0, 1, 2].every((i) => i === k || (i === 0 ? Math.abs(o.p[0] + j.p[0]) < 3 : Math.abs(o.p[i] - j.p[i]) < 3)),
    );

    if (!partner) return false;

    return k === 0 ? Math.abs(Math.abs(partner.p[0]) - Math.abs(j.p[0])) > 3 : Math.abs(partner.p[k] - j.p[k]) > 3;
  };
  const lineDist = (b, j) => {
    const k = along(j);
    let best = Infinity;

    for (let t = -600; t <= 600; t += 4) {
      const q = [...j.p];

      q[k] = t;
      best = Math.min(best, dist(b, q));
    }

    return best;
  };
  const misses = [];

  for (const j of joints) {
    const asLine = partnerDisagrees(j);
    const near = parts
      .map((p) => ({ p, d: asLine ? lineDist(p.bounds, j) : dist(p.bounds, j.p) }))
      .sort((a, b) => a.d - b.d)[0];

    if (near.d > 3) {
      misses.push(
        `- ${j.name} ${asLine ? `axis line through (${j.p.map((v) => Math.round(v)).join(', ')})` : `at (${j.p.map((v) => Math.round(v)).join(', ')})`} is ${Math.round(near.d)} mm outside the model (nearest: ${near.p.id})`,
      );
    }
  }

  const surfaceGap = (b, p) => {
    const inside = [0, 1, 2].every((k) => p[k] >= b.min[k] && p[k] <= b.max[k]);

    if (!inside) return dist(b, p);

    return Math.min(...[0, 1, 2].flatMap((k) => [p[k] - b.min[k], b.max[k] - p[k]]));
  };

  for (const j of joints) {
    if (!/camera|optical|lens|lidar|eye|sensor/i.test(j.name)) continue;

    const gap = Math.min(...parts.map((p) => surfaceGap(p.bounds, j.p)));

    if (gap > 12)
      misses.push(
        `- ${j.name} at (${j.p.map((v) => Math.round(v)).join(', ')}) is ${Math.round(gap)} mm from the nearest surface; a sensor looks out through the shell, so that shell (often the head) is too big, too high or too low`,
      );
  }

  const span = (vals) => [Math.min(...vals), Math.max(...vals)].map(Math.round).join('…');
  const mzMax = Math.max(...parts.map((p) => p.bounds.max[2]));
  const jzMax = Math.max(...joints.map((j) => j.p[2]));

  return [
    `${joints.length} joints and frames checked; the lowest joint fits best ${Math.round(lift)} mm above the model's floor (pass floorOffset to fix it). Joints whose left/right frames disagree along their axis are checked as axis lines.`,
    misses.length
      ? `Joints outside the model. Each one means that link is in the wrong place or too small: move or resize it until no joint is listed (residuals of 5–10 mm still put a whole leg or arm in the wrong place):\n${misses.slice(0, 40).join('\n')}`
      : 'Every joint sits inside the model.',
    `Joint span X ${span(joints.map((j) => j.p[0]))}, Y ${span(joints.map((j) => j.p[1]))}, Z ${span(joints.map((j) => j.p[2]))}; model span X ${span(parts.flatMap((p) => [p.bounds.min[0], p.bounds.max[0]]))}, Y ${span(parts.flatMap((p) => [p.bounds.min[1], p.bounds.max[1]]))}, Z ${span(parts.flatMap((p) => [p.bounds.min[2], p.bounds.max[2]]))}.`,
    `Model top is ${Math.round(mzMax - jzMax)} mm above the highest joint; check that against the photo (shells above the top joint, e.g. a head or cap).`,
  ].join('\n');
}
