import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_FILE = 'AGENTS.md';
const GUIDE_DIR = 'docs/guide';
const MAX_ROOT_LINES = 200;
const MAX_ROOT_BYTES = 32 * 1024;
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const SECTION_REF = /§(\d+[a-z]?)(?:-(\d+))?/g;
const SECTION_HEADING = /^#{1,6} (\d+[a-z]?(?:-\d+)?)\./;

function listFiles(pattern) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', pattern], {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr}`);

  return result.stdout.split('\n').filter((file) => file && fs.existsSync(path.join(root, file)));
}

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const isLocalLink = (target) => !/^[a-z]+:/i.test(target) && !target.startsWith('#');

function brokenLinks(file) {
  const problems = [];

  for (const [, target] of read(file).matchAll(LINK)) {
    if (!isLocalLink(target)) continue;

    const resolved = path.join(root, path.dirname(file), decodeURIComponent(target.split('#')[0]));

    if (!fs.existsSync(resolved)) problems.push(`${file}: link to ${target} goes nowhere`);
  }

  return problems;
}

function sectionIds(files) {
  const ids = new Set();

  for (const file of files) {
    for (const line of read(file).split('\n')) {
      const id = SECTION_HEADING.exec(line)?.[1];

      if (id) ids.add(id);
    }
  }

  return ids;
}

function brokenSections(file, ids) {
  const problems = [];

  for (const [ref, base, item] of read(file).matchAll(SECTION_REF)) {
    const known = ids.has(base) || (item !== undefined && ids.has(`${base}-${item}`));

    if (!known) problems.push(`${file}: ${ref} names no section`);
  }

  return problems;
}

function rootProblems(guides) {
  const text = read(ROOT_FILE);
  const lines = text.split('\n').length;
  const bytes = Buffer.byteLength(text);
  const problems = [];

  if (lines > MAX_ROOT_LINES) problems.push(`${ROOT_FILE} has ${lines} lines; keep it under ${MAX_ROOT_LINES}`);

  if (bytes > MAX_ROOT_BYTES) problems.push(`${ROOT_FILE} is ${bytes} bytes; Codex reads only ${MAX_ROOT_BYTES}`);

  for (const guide of guides) {
    if (!text.includes(`](${guide})`)) problems.push(`${guide} is missing from the guide index in ${ROOT_FILE}`);
  }

  return problems;
}

const guides = listFiles(`${GUIDE_DIR}/*.md`);
const rules = [...listFiles('AGENTS.md'), ...listFiles('**/AGENTS.md'), ...guides];
const ruleFiles = [...new Set(rules)];
const ids = sectionIds([ROOT_FILE, ...guides]);
const problems = [
  ...rootProblems(guides),
  ...ruleFiles.flatMap(brokenLinks),
  ...ruleFiles.flatMap((file) => brokenSections(file, ids)),
];

if (problems.length > 0) {
  console.error('Contributor docs need fixing:');
  problems.forEach((problem) => console.error(`  ${problem}`));
  console.error('See AGENTS.md and docs/research/Agent instructions.md.');
  process.exit(1);
}
