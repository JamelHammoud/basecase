import { isHullCrash, resolveHulls } from './hullFallback.mjs';
import { measure, weld } from './kernelMesh.mjs';
import { portsFromLogs } from './ports.mjs';

const SCAD_PRELUDE = '$fa = 6; $fs = 0.5; ';
const STL_ARGS = ['-o', '/part.stl', '--backend=manifold', '--export-format=binstl'];

const HULL_HINT =
  'Hint: a hull() (or a BOSL2 rounding that uses hull) got degenerate input. Change sizes slightly, avoid zero-thickness or coplanar pieces inside hull(), keep $fn at 32 or more, or use chamfer instead of rounding there.';

const FLAT_PART = 'The part is 2D. Extrude it (linear_extrude or rotate_extrude) to make a solid.';

function failureTitle(logs, fatal) {
  if (fatal.length) return 'OpenSCAD failed.';

  if (logs.some((l) => /top level object is empty/i.test(l))) return 'The part is empty (nothing was rendered).';

  return logs.some((l) => /not a 3D object/i.test(l)) ? FLAT_PART : 'OpenSCAD failed.';
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

function openscadError(logs, fatal, problems) {
  const hints = logs.some((l) => /applyHull/.test(l)) ? [HULL_HINT] : [];

  return new Error(
    [failureTitle(logs, fatal), ...explainErrors(logs, fatal.length ? fatal : problems), ...hints].join('\n'),
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

function makeDirs(FS, dir, made) {
  let cur = '';

  for (const p of dir.split('/').filter(Boolean)) {
    cur += `/${p}`;

    if (made.has(cur)) continue;

    try {
      FS.mkdir(cur);
    } catch {}

    made.add(cur);
  }
}

function installLibraries(FS, files) {
  const made = new Set();

  for (const [file, content] of files) {
    makeDirs(FS, file.slice(0, file.lastIndexOf('/')), made);
    FS.writeFile(file, content);
  }
}

export function createOpenscadEngine({ libraryFiles, scadFactory, manifold }) {
  let factory = null;
  let files = null;
  let warm = null;

  async function makeInstance() {
    factory ??= await scadFactory();
    files ??= await libraryFiles();

    const logs = [];
    const scad = await factory({ noInitialRun: true, print: (s) => logs.push(s), printErr: (s) => logs.push(s) });

    installLibraries(scad.getInstance().FS, files);

    return { scad, logs };
  }

  async function runOpenSCAD(code, args) {
    const { scad, logs } = (await warm) ?? (await makeInstance());

    warm = null;

    const FS = scad.getInstance().FS;

    FS.writeFile('/part.scad', code);

    let rc;

    try {
      rc = scad.getInstance().callMain(['/part.scad', ...args]);
    } catch (err) {
      logs.push(`ERROR: ${err?.message ?? err}`);
      rc = 1;
    }

    const problems = logs.filter((l) => /\b(ERROR|WARNING|TRACE)\b|Parser error|assertion violation/.test(l));
    const fatal = problems.filter((l) =>
      /\bERROR\b|Parser error|assertion violation|unknown (module|function|variable)|Ignoring unknown/i.test(l),
    );
    const read = (file) => {
      try {
        return FS.readFile(file);
      } catch {
        return null;
      }
    };

    return { rc, logs, problems, fatal, read };
  }

  async function exportCsg(code) {
    const { rc, logs, problems, fatal, read } = await runOpenSCAD(code, ['-o', '/part.csg']);
    const csg = read('/part.csg');

    if (rc !== 0 || fatal.length || !csg) throw openscadError(logs, fatal, problems);

    return { text: new TextDecoder().decode(csg), logs, problems };
  }

  async function renderOnce(code) {
    const { rc, logs, problems, fatal, read } = await runOpenSCAD(code, STL_ARGS);
    const stl = read('/part.stl');

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

  async function renderWithOwnHulls(code) {
    const tree = await exportCsg(code);
    const { text } = await resolveHulls(tree.text, renderOnce, manifold);
    const result = await renderOnce(text);
    const { ports, problems } = portsFromLogs(tree.logs);

    return { ...result, warnings: [...tree.problems.slice(0, 8), ...problems], ports };
  }

  return {
    async render(code) {
      try {
        return await renderOnce(SCAD_PRELUDE + code);
      } catch (err) {
        if (!isHullCrash(err?.message)) throw err;

        return await renderWithOwnHulls(SCAD_PRELUDE + code);
      }
    },
    prewarm() {
      warm ??= makeInstance().catch(() => null);
    },
  };
}
