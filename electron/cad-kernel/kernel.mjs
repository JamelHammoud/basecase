import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeAudit } from './audit.mjs';
import { portsFromLogs, portsFromObjects } from './ports.mjs';
import { occMessage, replicadScope, unwrapResult, wrapCode } from './replicadSupport.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const BOSL2_DIR = path.join(root, 'vendor', 'BOSL2');
const ROBOTICS_DIR = path.join(root, 'vendor', 'robotics');

function weld(soup) {
  const map = new Map();
  const positions = [];
  const indices = [];

  for (let i = 0; i < soup.length; i += 3) {
    const x = Math.round(soup[i] * 1000) / 1000;
    const y = Math.round(soup[i + 1] * 1000) / 1000;
    const z = Math.round(soup[i + 2] * 1000) / 1000;
    const key = `${x},${y},${z}`;
    let idx = map.get(key);

    if (idx === undefined) {
      idx = positions.length / 3;
      positions.push(x, y, z);
      map.set(key, idx);
    }

    indices.push(idx);
  }

  return { positions, indices };
}

function measure(positions, indices) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }

  let vol = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const [ax, ay, az] = [positions[a], positions[a + 1], positions[a + 2]];
    const [bx, by, bz] = [positions[b], positions[b + 1], positions[b + 2]];
    const [cx, cy, cz] = [positions[c], positions[c + 1], positions[c + 2]];

    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }

  const r = (v) => Math.round(v * 100) / 100;

  return {
    bbox: { min: min.map(r), max: max.map(r), size: max.map((v, i) => r(v - min[i])) },
    volume: Math.round(Math.abs(vol)),
    triangles: indices.length / 3,
  };
}

let scadFactory = null;
let libraryFiles = null;

function readTree(dir, prefix) {
  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) out.push(...readTree(full, rel));
    else if (entry.name.endsWith('.scad')) out.push([rel, fs.readFileSync(full, 'utf-8')]);
  }

  return out;
}

const SCAD_PRELUDE = '$fa = 6; $fs = 0.5; ';

async function renderOpenSCAD(code) {
  try {
    return await renderOpenSCADOnce(SCAD_PRELUDE + code);
  } catch (err) {
    if (/applyHull|assertion violation/.test(String(err?.message))) {
      return await renderOpenSCADOnce(`${SCAD_PRELUDE}${code}\n$fn = 41;\n`);
    }

    throw err;
  }
}

let warm = null;

async function makeScadInstance() {
  if (!scadFactory) scadFactory = (await import('openscad-wasm')).createOpenSCAD;

  if (!libraryFiles) {
    libraryFiles = [...readTree(BOSL2_DIR, '/libraries/BOSL2'), ...readTree(ROBOTICS_DIR, '/libraries')];
  }

  const logs = [];
  const scad = await scadFactory({ noInitialRun: true, print: (s) => logs.push(s), printErr: (s) => logs.push(s) });
  const FS = scad.getInstance().FS;
  const made = new Set();

  for (const [file, content] of libraryFiles) {
    const dir = path.posix.dirname(file);
    let cur = '';

    for (const p of dir.split('/').filter(Boolean)) {
      cur += `/${p}`;

      if (made.has(cur)) continue;

      try {
        FS.mkdir(cur);
      } catch {}

      made.add(cur);
    }

    FS.writeFile(file, content);
  }

  return { scad, logs };
}

function prewarm() {
  if (!warm) warm = makeScadInstance().catch(() => null);
}

const HULL_HINT =
  'Hint: a hull() (or a BOSL2 rounding that uses hull) got degenerate input. Change sizes slightly, avoid zero-thickness or coplanar pieces inside hull(), keep $fn at 32 or more, or use chamfer instead of rounding there.';

function openscadError(logs, fatal, problems) {
  const empty = logs.find((l) => /top level object is empty/i.test(l));
  const hints = logs.some((l) => /applyHull/.test(l)) ? [HULL_HINT] : [];

  return new Error(
    [
      empty && !fatal.length ? 'The part is empty (nothing was rendered).' : 'OpenSCAD failed.',
      ...explainErrors(logs, fatal.length ? fatal : problems),
      ...hints,
    ].join('\n'),
  );
}

function stlSoup(stl) {
  const dv = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);
  const count = dv.getUint32(80, true);
  const soup = new Array(count * 9);

  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12;

    for (let k = 0; k < 9; k++) soup[i * 9 + k] = dv.getFloat32(base + k * 4, true);
  }

  return soup;
}

async function renderOpenSCADOnce(code) {
  const { scad, logs } = (await warm) ?? (await makeScadInstance());

  warm = null;

  const FS = scad.getInstance().FS;

  FS.writeFile('/part.scad', code);

  let rc;

  try {
    rc = scad.getInstance().callMain(['/part.scad', '-o', '/part.stl', '--backend=manifold', '--export-format=binstl']);
  } catch (err) {
    logs.push(`ERROR: ${err?.message ?? err}`);
    rc = 1;
  }

  const problems = logs.filter((l) => /\b(ERROR|WARNING|TRACE)\b|Parser error|assertion violation/.test(l));
  const fatal = problems.filter((l) =>
    /\bERROR\b|Parser error|assertion violation|unknown (module|function|variable)|Ignoring unknown/i.test(l),
  );
  let stl = null;

  try {
    stl = FS.readFile('/part.stl');
  } catch {}

  if (rc !== 0 || fatal.length || !stl || stl.length < 84) throw openscadError(logs, fatal, problems);

  const { positions, indices } = weld(stlSoup(stl));
  const { ports, problems: portProblems } = portsFromLogs(logs);

  return {
    positions,
    indices,
    edges: null,
    warnings: [...problems.slice(0, 8), ...portProblems],
    stats: measure(positions, indices),
    ports,
  };
}

function explainErrors(logs, picked) {
  const out = [];

  for (const line of picked.slice(0, 6)) {
    const i = logs.indexOf(line);
    let msg = line.replace(/Assertion '.*' failed: "?/, 'Assertion failed: ');

    for (let k = i + 1; i >= 0 && k < logs.length && k < i + 6; k++) {
      if (/^(TRACE|ERROR|WARNING|ECHO|Current top level|Geometries in cache)/.test(logs[k])) break;

      msg += ' ' + logs[k].trim();
    }

    msg = msg.replace(/"\s+in file \/libraries\//, ' (in ').replace(/(\(in [^,]+), line \d+$/, '$1)');

    const trace =
      i >= 0 &&
      logs.slice(i + 1, i + 12).find((l) => /^TRACE: called by '([^']+)' in file \/part\.scad, line (\d+)/.test(l));

    if (trace) {
      const [, mod, ln] = trace.match(/called by '([^']+)' in file \/part\.scad, line (\d+)/);

      msg += ` — at line ${ln}, in ${mod}()`;
    }

    out.push(msg.replace(/\s+/g, ' ').trim());
  }

  return out;
}

let replicad = null;
let replicadOc = null;

function replicadHints(msg) {
  if (/has been deleted/i.test(msg)) {
    return [
      'Hint: replicad consumes shapes: fuse, cut, intersect, fillet, chamfer, shell, translate and rotate return a new shape and delete the old one. Reassign the result (s = s.fuse(b)) and call .clone() before reusing a shape twice.',
    ];
  }

  if (/previous curve|tangent arc/i.test(msg)) {
    return [
      'Hint: tangent arcs (tangentArcTo, smoothSplineTo) need a straight segment or curve before them in the same drawing. Start with movePointerTo + lineTo, or use threePointsArcTo.',
    ];
  }

  if (/is not a function/i.test(msg)) {
    return [
      'Hint: check the method exists on that object (sketches extrude/revolve/loftWith; drawings sketchOnPlane; 3D shapes fuse/cut/fillet/shell/translate/rotate).',
    ];
  }

  return [];
}

async function renderReplicad(code) {
  if (!replicad) {
    const ocFactory = (await import('replicad-opencascadejs')).default;
    const wasmPath = path.join(root, 'node_modules', 'replicad-opencascadejs', 'dist', 'replicad_single.wasm');
    const oc = await ocFactory({ locateFile: () => wasmPath });

    replicad = await import('replicad');
    replicad.setOC(oc);
    replicadOc = oc;
  }

  const scope = replicadScope(replicad);
  const names = Object.keys(scope);
  const run = new Function(...names, wrapCode(code));
  let result;

  try {
    result = run(...names.map((n) => scope[n]));

    if (result && typeof result.then === 'function') result = await result;
  } catch (err) {
    const message = occMessage(replicadOc, err);

    throw new Error([message, ...replicadHints(message)].join('\n'), { cause: err });
  }

  const { shape, ports: declared, notes } = unwrapResult(result);

  result = shape;

  if (!result || typeof result.mesh !== 'function') {
    throw new Error(
      'The code must `return` a replicad 3D shape (e.g. return sketch.extrude(10)), or { shape, ports }.',
    );
  }

  const mesh = result.mesh({ tolerance: 0.05, angularTolerance: 0.15 });
  let edges = null;

  try {
    const e = result.meshEdges({ tolerance: 0.05, angularTolerance: 0.15 });

    edges = Array.from(e.lines ?? []).map((v) => Math.round(v * 1000) / 1000);
  } catch {}

  const positions = Array.from(mesh.vertices).map((v) => Math.round(v * 1000) / 1000);
  const indices = Array.from(mesh.triangles);
  const stats = measure(positions, indices);

  try {
    stats.volume = Math.round(replicad.measureVolume(result));
  } catch {}

  const { ports, problems } = portsFromObjects(declared);

  return { positions, indices, edges, warnings: [...notes, ...problems], stats, ports };
}

let chain = Promise.resolve();

process.on('message', (msg) => {
  chain = chain.then(() => runJob(msg));
});

const EMPTY_PART =
  'The part is empty: a boolean removed everything. Check that the cutters are smaller than the body and that intersected shapes overlap.';

function auditJob({ id, mesh }) {
  const stats = measure(mesh.positions, mesh.indices);

  process.send({ id, ok: true, stats, audit: safeAudit({ ...mesh, stats }) });
}

async function runJob(msg) {
  const { id, language, code, expect } = msg ?? {};
  const started = Date.now();

  if (msg?.mesh) return auditJob(msg);

  try {
    const result = language === 'replicad' ? await renderReplicad(code) : await renderOpenSCAD(code);

    if (!result.indices.length) throw new Error(EMPTY_PART);

    const audit = safeAudit({ ...result, expect });

    process.send({ id, ok: true, ...result, audit, ms: Date.now() - started });
  } catch (err) {
    process.send({ id, ok: false, error: String(err?.message ?? err).slice(0, 4000), ms: Date.now() - started });
  }

  if (language !== 'replicad') prewarm();
}

process.send?.({ ready: true });
prewarm();
