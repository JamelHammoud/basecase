import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fail, pass, ROOT } from './gate.mjs';

export const BUILDER_DIRS = Object.freeze(['src', 'electron', 'forge', 'hw']);

const SKIPPED_DIRS = new Set(['node_modules', 'target', 'dist', 'build', '.venv', '__pycache__', '.git', 'release']);
const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|rs|py|sh|ps1|json|toml|html|wgsl|metal|c|h|cpp|txt|md|yaml|yml)$/i;
const MAX_BYTES = 4 * 1024 * 1024;

const REFERENCES = [
  /(?<![\w-])verify[/\\]/g,
  /\b(?:join|resolve|Path|joinpath)\s*\((?:[^()]|\([^()]*\))*?['"`]verify['"`]/gs,
  /['"`]verify['"`]\s*\/|\/\s*['"`]verify['"`]/g,
];

const FIXTURE_TAIL = /^verify['"`]?\s*[,/\\]\s*['"`]?(?:out['"`]?\s*[,/\\]\s*['"`]?)?fixtures\b/;
const GATE_TAIL = /^verify[/\\]gatekeeper\.mjs\b/;

const isTestFile = (file) => /\.test\.|(^|\/)tests\/|(^|\/)e2e\//.test(file);
const isScript = (file) => /\.(sh|ps1)$/.test(file);

function allowed(file, tail) {
  if (isTestFile(file) && FIXTURE_TAIL.test(tail)) return true;

  return isScript(file) && GATE_TAIL.test(tail);
}

function walk(root, relative, out) {
  const full = path.join(root, relative);

  if (!fs.existsSync(full)) return out;

  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;

    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) walk(root, child, out);
    else if (entry.isFile() && TEXT.test(entry.name)) out.push(child);
  }

  return out;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

export function referencesIn(file, text) {
  const hits = [];

  for (const pattern of REFERENCES) {
    for (const m of text.matchAll(pattern)) {
      const at = m.index + m[0].lastIndexOf('verify');
      const tail = text.slice(at, at + 80);

      if (!allowed(file, tail)) hits.push(`${file}:${lineOf(text, at)}: ${text.slice(at, at + 60).split('\n')[0]}`);
    }
  }

  return [...new Set(hits)];
}

export function verifyReferences(root = ROOT, dirs = BUILDER_DIRS) {
  const files = dirs.flatMap((d) => walk(root, d, []));
  const hits = files.flatMap((file) => {
    const full = path.join(root, file);

    return fs.statSync(full).size > MAX_BYTES ? [] : referencesIn(file, fs.readFileSync(full, 'utf8'));
  });

  return { files: files.length, hits };
}

export const isolationCheck = {
  name: 'nothing in src, electron, forge or hw imports or reads from verify (test fixtures and the gate script aside)',
  run: () => {
    const { files, hits } = verifyReferences();

    if (!files) return fail('Scanned no files');

    return hits.length ? fail(hits.join('\n')) : pass(`${files} files scanned`);
  },
};

const PLANTED = {
  'src/reality/calibrate.ts': [
    "import { oracleFit } from '../../verify/twin/units';",
    "import fs from 'node:fs';",
    'export const peek = (root: string) =>',
    "  fs.readdirSync(path.join(root, 'verify', 'out', 'twin'));",
  ].join('\n'),
  'src/reality/peek.py': "units = json.load(open(ROOT / 'verify' / 'out' / 'twin' / name))\n",
  'src/reality/calibrate.test.ts': "const units = read(path.join(ROOT, 'verify/out/twin/x.json'));\n",
};

export const isolationCanary = {
  name: 'a calibrator that imports verify/twin or reads verify/out/twin is caught',
  run: () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-canary-'));

    try {
      for (const [file, text] of Object.entries(PLANTED)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), text);
      }

      const { hits } = verifyReferences(root);
      const caught = Object.keys(PLANTED).filter((f) => hits.some((h) => h.startsWith(`${f}:`)));

      return caught.length === Object.keys(PLANTED).length
        ? fail(`The scan caught ${hits.length} planted references`)
        : pass(`Only caught ${caught.join(', ') || 'nothing'}`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
};
