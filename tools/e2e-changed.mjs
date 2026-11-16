import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const escape = (name) =>
  name
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r');

export function changedLines(diff) {
  const lines = new Set();

  for (const line of diff.split('\n')) {
    const match = HUNK.exec(line);

    if (!match) continue;

    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);

    if (count === 0) lines.add(start + 0.5);

    for (let n = start; n < start + count; n++) lines.add(n);
  }

  return lines;
}

function chain(node) {
  if (ts.isIdentifier(node)) return [node.text];

  if (ts.isPropertyAccessExpression(node)) return [...chain(node.expression), node.name.text];

  if (ts.isCallExpression(node)) return chain(node.expression);

  if (ts.isTaggedTemplateExpression(node)) return chain(node.tag);

  return [];
}

function isChainChild(node) {
  const parent = node.parent;

  return (
    ((ts.isCallExpression(parent) || ts.isPropertyAccessExpression(parent)) && parent.expression === node) ||
    (ts.isTaggedTemplateExpression(parent) && parent.tag === node)
  );
}

function titlePattern(node, parameterized) {
  if (!node || (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node))) return null;

  if (node.text.length === 0) return null;

  if (!parameterized) return escape(node.text);

  const tokens = /%%|%[sdifjoO#$]|\$[$\p{ID_Continue}.]+/gu;
  let result = '';
  let end = 0;

  for (const match of node.text.matchAll(tokens)) {
    result += escape(node.text.slice(end, match.index));
    result += match[0] === '%%' ? '%' : '[\\s\\S]*?';
    end = match.index + match[0].length;
  }

  return result + escape(node.text.slice(end));
}

export function declarations(source) {
  const tree = ts.createSourceFile('browser.test.ts', source, ts.ScriptTarget.Latest, true);
  const tests = [];
  const suites = [];
  const lineAt = (position) => tree.getLineAndCharacterOfPosition(position).line + 1;
  const visit = (node, ancestors = []) => {
    const parts = ts.isCallExpression(node) ? chain(node.expression) : [];
    const root = parts[0];
    const suite = ['describe', 'suite'].includes(root);
    const factory =
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ['each', 'for', 'skipIf', 'runIf'].includes(node.expression.name.text);
    const test = /^(?:it|test|itUnless\w+)$/.test(root ?? '');

    if ((!suite && !test) || factory || isChainChild(node)) {
      ts.forEachChild(node, (child) => visit(child, ancestors));

      return;
    }

    const title = titlePattern(node.arguments[0], parts.includes('each') || parts.includes('for'));
    const titles = [...ancestors, title];
    const item = {
      start: lineAt(node.getStart(tree)),
      end: lineAt(node.end),
      pattern: titles.includes(null) ? null : `^${titles.join(' > ')}$`,
    };

    (suite ? suites : tests).push(item);

    if (suite) ts.forEachChild(node, (child) => visit(child, titles));
  };

  visit(tree);

  return { tests, suites, invalid: tree.parseDiagnostics.length > 0 };
}

export function testsAt(source, lines) {
  const { tests, invalid } = declarations(source);
  const contains = (item, line) => item.start <= line && line <= item.end;
  const touched = tests.filter((item) => [...lines].some((line) => contains(item, line)));
  const sharedEdit = [...lines].some((line) => Number.isInteger(line) && !tests.some((item) => contains(item, line)));
  const fallback = invalid || sharedEdit || touched.some((item) => item.pattern === null);

  return { pattern: [...new Set(touched.map((item) => item.pattern).filter(Boolean))].join('|'), fallback };
}

export function sharedDeletions(source, diff) {
  const { tests, invalid } = declarations(source);
  const lines = source.split('\n');
  const hunks = [...diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+,0 @@/gm)];

  if (invalid) return true;

  return hunks.some((match) => {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);

    return Array.from({ length: count }, (_, offset) => start + offset).some(
      (line) => lines[line - 1]?.trim() && !tests.some((test) => test.start <= line && line <= test.end),
    );
  });
}

function removedSetup({ git, revision, file, diff }) {
  if (!/\+\d+,0 @@/.test(diff)) return false;

  try {
    return sharedDeletions(git(['show', `${revision}:${file}`]), diff);
  } catch {
    return true;
  }
}

function main(base) {
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const revision = git(['merge-base', base, 'HEAD']).trim();
  const files = git([
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    `${revision}..HEAD`,
    '--',
    'e2e/**/*.e2e.test.ts',
    'e2e/*.e2e.test.ts',
  ])
    .split('\n')
    .filter(Boolean);
  const selections = files.map((file) => {
    const diff = git(['diff', '-U0', `${revision}..HEAD`, '--', file]);
    const selection = testsAt(fs.readFileSync(file, 'utf8'), changedLines(diff));

    return { file, ...selection, fallback: selection.fallback || removedSetup({ git, revision, file, diff }) };
  });
  const fallbackFiles = selections.filter((item) => item.fallback).map((item) => item.file);
  const precise = selections.filter((item) => !item.fallback && item.pattern);

  console.log(
    JSON.stringify({
      files: precise.map((item) => item.file),
      pattern: precise.map((item) => item.pattern).join('|'),
      fallbackFiles,
    }),
  );
}

if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1])) {
  main(process.argv[2]);
}
