const OPEN = '([{';
const CLOSE = ')]}';

interface Scan {
  code: string;
  i: number;
}

function skipString({ code, i }: Scan): number {
  let j = i + 1;

  while (j < code.length && code[j] !== '"') j += code[j] === '\\' ? 2 : 1;

  return j + 1;
}

function skipComment({ code, i }: Scan): number {
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

function skipBlank(code: string, from: number): number {
  let i = from;

  for (;;) {
    while (i < code.length && /\s/.test(code[i])) i++;

    const next = skipComment({ code, i });

    if (next === i) return i;

    i = next;
  }
}

const startsInclude = (text: string) => /^(include|use)\s*</.test(text);

const closes = (code: string, ch: string, next: number) =>
  ch === ';' || (ch === '}' && !code.startsWith('else', skipBlank(code, next)));

function endOfStatement(code: string, start: number): number {
  const head = skipBlank(code, start);

  if (startsInclude(code.slice(head, head + 12))) {
    const close = code.indexOf('>', head);

    return close < 0 ? code.length : close + 1;
  }

  let depth = 0;
  let i = head;

  while (i < code.length) {
    const ch = code[i];
    const skipped = ch === '"' ? skipString({ code, i }) : skipComment({ code, i });

    if (skipped !== i) {
      i = skipped;

      continue;
    }

    if (OPEN.includes(ch)) depth++;

    if (CLOSE.includes(ch)) depth--;

    i++;

    if (depth === 0 && closes(code, ch, i)) return i;
  }

  return code.length;
}

export function scadStatements(code: string): string[] {
  const out: string[] = [];
  let at = 0;

  while (skipBlank(code, at) < code.length) {
    const end = endOfStatement(code, at);

    out.push(code.slice(at, end));
    at = end;
  }

  const tail = code.slice(at);

  if (tail.trim()) out.push(tail);

  return out;
}

const DEFINITION = /^(module|function)\b|^(include|use)\s*<|^\$?[A-Za-z_]\w*\s*=(?!=)/;

export function isScadDefinition(statement: string): boolean {
  const body = statement.slice(skipBlank(statement, 0));

  return DEFINITION.test(body);
}
