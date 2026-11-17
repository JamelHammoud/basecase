export const KICAD_BOARD_LIMITS = { bytes: 8 * 1024 * 1024, depth: 48, nodes: 100_000, atoms: 500_000 };

export class BoardImportError extends Error {
  code;

  constructor(code) {
    super(code);
    this.code = code;
  }
}

const fail = () => {
  throw new BoardImportError('board-format');
};
const forbidden = new Set([
  'model',
  'image',
  'embedded_files',
  'file',
  'sheet',
  'extends',
  'face',
  'page_layout_descr_file',
  'drawing_sheet',
]);

function quoted(text, start) {
  const escapes = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };
  const chunks = [];
  let position = start + 1;
  let from = position;

  while (position < text.length) {
    const char = text[position++];

    if (char === '"') return { atom: chunks.join('') + text.slice(from, position - 1), position };

    if (char !== '\\') continue;

    chunks.push(text.slice(from, position - 1));

    const escaped = escapes[text[position++]];

    if (escaped === undefined) fail();

    chunks.push(escaped);
    from = position;
  }

  return fail();
}

function openNode(state) {
  if (++state.nodes > KICAD_BOARD_LIMITS.nodes || state.stack.length >= KICAD_BOARD_LIMITS.depth) fail();

  const child = [];

  state.stack[state.stack.length - 1].push(child);
  state.stack.push(child);
  state.position++;
}

function closeNode(state) {
  if (state.stack.length === 1) fail();

  const child = state.stack.pop();

  if (typeof child[0] !== 'string' || forbidden.has(child[0].toLowerCase())) fail();

  if (String(child[0]).toLowerCase() === 'embedded_fonts' && (child.length !== 2 || child[1] !== 'no')) fail();

  state.position++;
}

function appendAtom(text, state) {
  if (++state.atoms > KICAD_BOARD_LIMITS.atoms || state.stack.length === 1) fail();

  if (text[state.position] === '"') {
    const token = quoted(text, state.position);

    state.stack[state.stack.length - 1].push(token.atom);
    state.position = token.position;

    return;
  }

  const start = state.position;

  while (state.position < text.length && !/[\s()"\\]/u.test(text[state.position])) state.position++;

  if (start === state.position) fail();

  state.stack[state.stack.length - 1].push(text.slice(start, state.position));
}

function scan(text, state) {
  const char = text[state.position];

  if (/\s/u.test(char)) {
    state.position++;

    return;
  }

  if (char === '(') return openNode(state);

  if (char === ')') return closeNode(state);

  appendAtom(text, state);
}

export function readKiCadDocument(text, rootName = 'kicad_pcb') {
  if (typeof text !== 'string' || text.length > KICAD_BOARD_LIMITS.bytes) fail();

  const bytes = new TextEncoder().encode(text);

  if (bytes.byteLength > KICAD_BOARD_LIMITS.bytes || bytes.some((value) => value < 32 && ![9, 10, 13].includes(value)))
    fail();

  const root = [];
  const state = { stack: [root], position: 0, nodes: 0, atoms: 0 };

  while (state.position < text.length) scan(text, state);

  if (state.stack.length !== 1 || root.length !== 1 || !Array.isArray(root[0]) || root[0][0] !== rootName) fail();

  return root[0];
}

export const kiCadChildren = (node, key) => node.filter((child) => Array.isArray(child) && child[0] === key);

export function kiCadChild(node, key) {
  const children = kiCadChildren(node, key);

  if (children.length !== 1) fail();

  return children[0];
}

export function kiCadNumber(value) {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) return fail();

  const number = Number(value);

  if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) fail();

  return number;
}

export const readKiCadBoard = (text) => readKiCadDocument(text, 'kicad_pcb');
