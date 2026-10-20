export type TokenKind = 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'builtin' | 'function' | 'special';

export interface Token {
  kind: TokenKind;
  text: string;
}

type Family = 'openscad' | 'js' | 'python' | 'shell' | 'plain';

interface Grammar {
  lineComment: string | null;
  blockComments: boolean;
  keywords: Set<string>;
  builtins: Set<string>;
}

const words = (list: string) => new Set(list.split(' '));

const GRAMMARS: Record<Family, Grammar> = {
  openscad: {
    lineComment: '//',
    blockComments: true,
    keywords: words('module function if else for let each include use true false undef intersection_for assert echo'),
    builtins: words(
      'cube sphere cylinder polyhedron square circle polygon text translate rotate scale mirror resize multmatrix color offset hull minkowski union difference intersection linear_extrude rotate_extrude projection render children import surface',
    ),
  },
  js: {
    lineComment: '//',
    blockComments: true,
    keywords: words(
      'const let var function return if else for while do new class extends import export from of in typeof instanceof true false null undefined this async await break continue switch case default try catch finally throw',
    ),
    builtins: words('Math Number String Array Object JSON console'),
  },
  python: {
    lineComment: '#',
    blockComments: false,
    keywords: words(
      'def return if elif else for while import from as class True False None and or not in is with lambda try except finally raise pass yield async await self',
    ),
    builtins: words('print len range list dict set tuple int float str open'),
  },
  shell: {
    lineComment: '#',
    blockComments: false,
    keywords: words('if then else fi for do done while case esac function export'),
    builtins: words('cd ls npm npx node git echo cat'),
  },
  plain: { lineComment: null, blockComments: false, keywords: new Set(), builtins: new Set() },
};

const FAMILIES: Record<string, Family> = {
  openscad: 'openscad',
  scad: 'openscad',
  replicad: 'js',
  javascript: 'js',
  js: 'js',
  jsx: 'js',
  typescript: 'js',
  ts: 'js',
  tsx: 'js',
  json: 'js',
  python: 'python',
  py: 'python',
  bash: 'shell',
  sh: 'shell',
  shell: 'shell',
  zsh: 'shell',
};

const NUMBER = /(?:0x[\da-f]+|\d*\.?\d+(?:e[+-]?\d+)?)/iy;
const IDENT = /[A-Za-z_$][\w$]*/y;
const STRING = /(["'`])(?:\\[\s\S]|(?!\1)[^\\])*\1?/y;
const INCLUDE_PATH = /<[^>\n]*>/y;
const SPACE_THEN_PAREN = /\s*\(/y;

export const familyOf = (language: string | undefined): Family => FAMILIES[(language ?? '').toLowerCase()] ?? 'plain';

function matchAt(pattern: RegExp, code: string, at: number): string | null {
  pattern.lastIndex = at;

  return pattern.exec(code)?.[0] ?? null;
}

function untilEnd(code: string, at: number, end: number, extra: number): string {
  return end < 0 ? code.slice(at) : code.slice(at, end + extra);
}

function comment(code: string, at: number, grammar: Grammar): string | null {
  if (grammar.lineComment && code.startsWith(grammar.lineComment, at))
    return untilEnd(code, at, code.indexOf('\n', at), 0);

  if (!grammar.blockComments || !code.startsWith('/*', at)) return null;

  return untilEnd(code, at, code.indexOf('*/', at + 2), 2);
}

interface Scan {
  code: string;
  at: number;
  grammar: Grammar;
  family: Family;
}

function wordKind(word: string, { code, at, grammar, family }: Scan): TokenKind {
  if (grammar.keywords.has(word)) return 'keyword';

  if (family === 'openscad' && word.startsWith('$')) return 'special';

  if (grammar.builtins.has(word)) return 'builtin';

  return matchAt(SPACE_THEN_PAREN, code, at + word.length) !== null ? 'function' : 'plain';
}

function nextToken(scan: Scan, previous: Token | undefined): Token {
  const { code, at, grammar, family } = scan;
  const note = comment(code, at, grammar);

  if (note) return { kind: 'comment', text: note };

  const quoted = matchAt(STRING, code, at);

  if (quoted) return { kind: 'string', text: quoted };

  const path = previous?.kind === 'keyword' && family === 'openscad' ? matchAt(INCLUDE_PATH, code, at) : null;

  if (path) return { kind: 'string', text: path };

  const number = matchAt(NUMBER, code, at);

  if (number) return { kind: 'number', text: number };

  const word = matchAt(IDENT, code, at);

  if (word) return { kind: wordKind(word, scan), text: word };

  return { kind: 'plain', text: code[at] };
}

function lastMeaningful(tokens: Token[]): Token | undefined {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].text.trim()) return tokens[i];
  }

  return undefined;
}

function pushMerged(tokens: Token[], token: Token): void {
  const last = tokens[tokens.length - 1];

  if (last?.kind === token.kind && token.kind === 'plain') last.text += token.text;
  else tokens.push(token);
}

export function highlight(code: string, language?: string): Token[] {
  const family = familyOf(language);
  const grammar = GRAMMARS[family];
  const tokens: Token[] = [];
  let at = 0;

  while (at < code.length) {
    const token = nextToken({ code, at, grammar, family }, lastMeaningful(tokens));

    pushMerged(tokens, token);
    at += token.text.length;
  }

  return tokens;
}

export function highlightLines(code: string, language?: string): Token[][] {
  const lines: Token[][] = [[]];

  for (const token of highlight(code, language)) {
    token.text.split('\n').forEach((piece, i) => {
      if (i > 0) lines.push([]);

      if (piece) lines[lines.length - 1].push({ kind: token.kind, text: piece });
    });
  }

  return lines;
}
