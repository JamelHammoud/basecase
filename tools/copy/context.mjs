import ts from 'typescript';

export const CONTEXT_LIMIT = 6000;
export const CONTEXT_NOTE =
  'Source proximity only, not proven simultaneous visibility. Dynamic composition, imported children and unresolved conditions require inspection. No automatic semantic verdict.';

const lineOf = (file, position) => file.getLineAndCharacterOfPosition(position).line + 1;
const clip = (text, limit = 180) => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);
const functionName = (node) => node.name?.getText() ?? node.parent?.name?.getText() ?? '<anonymous>';

function scopeAt(file, line) {
  let scope = file;
  const conditions = [];
  const visit = (node) => {
    if (lineOf(file, node.getStart(file)) > line || lineOf(file, node.end) < line) return;

    const namedFunction = ts.isFunctionLike(node) && node.body && (node.name || ts.isVariableDeclaration(node.parent));

    if (namedFunction || (scope === file && ts.isFunctionLike(node) && node.body)) scope = node;

    if (ts.isConditionalExpression(node) || ts.isIfStatement(node) || ts.isBinaryExpression(node)) {
      conditions.push(lineOf(file, node.getStart(file)));
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return { scope, conditions };
}

function sourceGroups({ file: name, after }, occurrences) {
  if (after === null || occurrences.length === 0) return [];

  const file = ts.createSourceFile(name, after, ts.ScriptTarget.Latest, true);
  const lines = after.split(/\r?\n/);
  const groups = new Map();

  for (const occurrence of occurrences) {
    const { scope, conditions } = scopeAt(file, occurrence.line);
    const start = lineOf(file, scope.getStart(file));
    const end = lineOf(file, scope.end);
    const group = groups.get(start) ?? { name: scope === file ? '<module>' : functionName(scope), lines: new Map() };

    group.lines.set(start, Math.min(group.lines.get(start) ?? Infinity, 1));

    for (const condition of conditions) group.lines.set(condition, Math.min(group.lines.get(condition) ?? Infinity, 2));

    for (let line = Math.max(start, occurrence.line - 3); line <= Math.min(end, occurrence.line + 3); line++) {
      const priority = line === occurrence.line ? 0 : Math.abs(line - occurrence.line) + 2;

      group.lines.set(line, Math.min(group.lines.get(line) ?? Infinity, priority));
    }

    groups.set(start, group);
  }

  return [...groups.values()].map((group) => ({
    heading: `${name} / ${clip(group.name, 80)}`,
    lines: [...group.lines]
      .sort((a, b) => a[1] - b[1] || a[0] - b[0])
      .map(([line]) => ({ line, text: `${line}: ${clip(lines[line - 1] ?? '')}` })),
  }));
}

export function sourceContext(sources, occurrences) {
  const groups = sources.flatMap((source) =>
    sourceGroups(
      source,
      occurrences.filter((s) => s.file === source.file),
    ),
  );

  return groups.sort((a, b) => a.lines.length - b.lines.length);
}

export function formatSourceContext(groups, budget = CONTEXT_LIMIT) {
  if (!groups?.length) return '';

  const limit = Math.min(CONTEXT_LIMIT, budget);

  const prefix = `\n\n${CONTEXT_NOTE}\n`;
  const omitted = '\nSource context omitted beyond report budget.';

  if (limit < prefix.length + omitted.length) return '';

  let text = prefix;

  for (const group of groups) {
    const heading = `\n${group.heading}\n`;

    if (text.length + heading.length + omitted.length > limit) return text + omitted;

    text += heading;

    const selected = [];
    let remaining = limit - text.length - omitted.length;

    for (const line of group.lines) {
      if (line.text.length + 1 > remaining) continue;

      selected.push(line);
      remaining -= line.text.length + 1;
    }

    text += selected
      .sort((a, b) => a.line - b.line)
      .map(({ text: source }) => `${source}\n`)
      .join('');

    if (selected.length < group.lines.length) return text + omitted;
  }

  return text.trimEnd();
}
