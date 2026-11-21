function skipTrivia(script: string, start: number) {
  const trivia = /\s+|\/\*[\s\S]*?\*\/|\/\/[^\n\r\u2028\u2029]*/y;
  let end = start;
  let line = false;
  let match: RegExpExecArray | null;

  trivia.lastIndex = start;

  while ((match = trivia.exec(script))) {
    end = trivia.lastIndex;
    line ||= /[\n\r\u2028\u2029]/.test(match[0]);
  }

  return { end, line };
}

export function usesStrictDirective(script: string): boolean {
  const literal = /"(?:[^"\\\n\r\u2028\u2029]|\\[\s\S])*"|'(?:[^'\\\n\r\u2028\u2029]|\\[\s\S])*'/y;
  const continuation = /(?:[([.`*/%<>=&|^?,]|\+(?!\+)|-(?!-)|!=|in\b|instanceof\b)/y;
  let offset = 0;

  while (offset < script.length) {
    literal.lastIndex = skipTrivia(script, offset).end;

    const match = literal.exec(script);

    if (!match) return false;

    const after = skipTrivia(script, literal.lastIndex);
    const semicolon = script[after.end] === ';';

    continuation.lastIndex = after.end;

    if (!semicolon && after.end < script.length && (!after.line || continuation.test(script))) return false;

    if (match[0] === '"use strict"' || match[0] === "'use strict'") return true;

    offset = after.end + Number(semicolon);
  }

  return false;
}
