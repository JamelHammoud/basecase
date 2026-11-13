const OPEN = '([{';
const CLOSE = ')]}';
const TRAILING_COMMENT = /^[ \t]*\/\/[^\n]*/;

function skipString(code, i) {
  let j = i + 1;

  while (j < code.length && code[j] !== '"') j += code[j] === '\\' ? 2 : 1;

  return j + 1;
}

function skipComment(code, i) {
  if (code.startsWith('//', i)) {
    const end = code.indexOf('\n', i);

    return end < 0 ? code.length : end;
  }

  if (code.startsWith('/*', i)) {
    const end = code.indexOf('*/', i + 2);

    return end < 0 ? code.length : end + 2;
  }

  return i;
}

export function skipBlank(code, from) {
  let i = from;

  for (;;) {
    while (i < code.length && /\s/.test(code[i])) i++;

    const next = skipComment(code, i);

    if (next === i) return i;

    i = next;
  }
}

const startsInclude = (text) => /^(include|use)\s*</.test(text);

const closes = (code, ch, next) => ch === ';' || (ch === '}' && !code.startsWith('else', skipBlank(code, next)));

const withTrailingComment = (code, end) => end + (TRAILING_COMMENT.exec(code.slice(end))?.[0].length ?? 0);

function endOfStatement(code, start) {
  const head = skipBlank(code, start);

  if (startsInclude(code.slice(head, head + 12))) {
    const close = code.indexOf('>', head);

    return close < 0 ? code.length : close + 1;
  }

  let depth = 0;
  let i = head;

  while (i < code.length) {
    const ch = code[i];
    const skipped = ch === '"' ? skipString(code, i) : skipComment(code, i);

    if (skipped !== i) {
      i = skipped;

      continue;
    }

    if (OPEN.includes(ch)) depth++;

    if (CLOSE.includes(ch)) depth--;

    i++;

    if (depth === 0 && closes(code, ch, i)) return withTrailingComment(code, i);
  }

  return code.length;
}

export function scadStatementSpans(code) {
  const out = [];
  let at = 0;

  while (skipBlank(code, at) < code.length) {
    const end = endOfStatement(code, at);

    out.push({ start: at, end });
    at = end;
  }

  if (code.slice(at).trim()) out.push({ start: at, end: code.length });

  return out;
}

export const scadStatements = (code) => scadStatementSpans(code).map(({ start, end }) => code.slice(start, end));

const DEFINITION = /^(module|function)\b|^(include|use)\s*<|^\$?[A-Za-z_]\w*\s*=(?!=)/;

export function isScadDefinition(statement) {
  const body = statement.slice(skipBlank(statement, 0));

  return DEFINITION.test(body);
}
