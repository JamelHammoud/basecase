import ts from 'typescript';

export const SLOT = '{…}';

export const JSX_PROPS = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'title',
  'placeholder',
  'label',
  'alt',
  'tooltip',
  'description',
  'emptyText',
  'confirmLabel',
  'subtitle',
  'hint',
  'caption',
  'heading',
]);

export const OBJECT_KEYS = new Set([
  'label',
  'title',
  'placeholder',
  'tooltip',
  'description',
  'emptyText',
  'confirmLabel',
  'subtitle',
  'hint',
]);

export const CALLS = new Set(['showToast', 'toastInFront', 'toast', 'notify', 'confirmAction']);

const CALL_KEYS = new Set([...OBJECT_KEYS, 'body', 'message']);

const UNITS = new Set(
  [
    'mm',
    'cm',
    'm',
    'km',
    'in',
    'ft',
    'g',
    'kg',
    'mg',
    'lb',
    'oz',
    'n',
    'nm',
    'n·m',
    'n·cm',
    'kg·cm',
    'mn·m',
    's',
    'ms',
    'min',
    'h',
    'hz',
    'khz',
    'mhz',
    'ghz',
    'v',
    'mv',
    'a',
    'ma',
    'mah',
    'w',
    'wh',
    'rpm',
    'deg',
    'rad',
    'rad/s',
    'px',
    'fps',
    'mb',
    'gb',
    'kb',
  ].map((unit) => unit.toLowerCase()),
);

const SLOT_PATTERN = /\$?\{[^{}]*\}/g;
const URL_OR_PATH = /^(?:[a-z]+:\/\/\S+|[\w.@-]*\/[\w./@-]+|[\w-]+\.[a-z0-9]{1,5})$/i;
const IDENTIFIER = /^[a-z]\w*(?:[-_.:]\w+)+$|^[a-z]+[A-Z]\w*$/;

export const normalize = (text) =>
  text
    .replace(/\s+/g, ' ')
    .replace(SLOT_PATTERN, SLOT)
    .replace(/\{…\}(?:\s*\{…\})+/g, SLOT)
    .trim();

export function isUserFacing(text) {
  const words = text.replaceAll(SLOT, ' ').trim();
  const bare = words.replace(/[\d\s.,:;×x%°±+\-–—/()[\]]+/gi, ' ').trim();

  if (!/\p{L}{2,}/u.test(words)) return false;

  if (UNITS.has(bare.toLowerCase())) return false;

  return !URL_OR_PATH.test(words) && !IDENTIFIER.test(words);
}

const unwrap = (node) =>
  ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    ? unwrap(node.expression)
    : node;

const templateText = (node) =>
  node.head.text + node.templateSpans.map((span) => `${SLOT}${span.literal.text}`).join('');

const LOGICAL = new Set([
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
]);

export function stringsOf(expression) {
  const node = unwrap(expression);

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ node, text: node.text }];

  if (ts.isTemplateExpression(node)) return [{ node, text: templateText(node) }];

  if (ts.isConditionalExpression(node)) return [...stringsOf(node.whenTrue), ...stringsOf(node.whenFalse)];

  if (ts.isBinaryExpression(node) && LOGICAL.has(node.operatorToken.kind)) {
    const left = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? [] : stringsOf(node.left);

    return [...left, ...stringsOf(node.right)];
  }

  return [];
}

const propName = (name) => (ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null);

const calleeName = (call) => {
  const callee = unwrap(call.expression);

  if (ts.isIdentifier(callee)) return callee.text;

  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
};

const isLiteral = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

function jsxChildPiece(child) {
  if (ts.isJsxText(child)) return child.text;

  const literal = ts.isJsxExpression(child) && child.expression && isLiteral(unwrap(child.expression));

  if (literal) return unwrap(child.expression).text;

  return ts.isJsxExpression(child) && !child.expression ? '' : SLOT;
}

function jsxChildrenText(element) {
  const hasText = element.children.some((child) => ts.isJsxText(child) && child.text.trim() !== '');

  return hasText ? element.children.map(jsxChildPiece).join('') : null;
}

const tagged = (hits, kind) => hits.map((hit) => ({ ...hit, kind }));

function callStrings(call) {
  const kind = calleeName(call);

  if (!CALLS.has(kind)) return [];

  const hits = call.arguments.flatMap((arg) => {
    const node = unwrap(arg);

    if (!ts.isObjectLiteralExpression(node)) return stringsOf(node);

    return node.properties
      .filter((prop) => ts.isPropertyAssignment(prop) && CALL_KEYS.has(propName(prop.name)))
      .flatMap((prop) => stringsOf(prop.initializer));
  });

  return tagged(hits, kind);
}

function attributeStrings(attribute) {
  const name = attribute.name.getText();
  const init = attribute.initializer;

  if (!JSX_PROPS.has(name) || !init) return [];

  if (ts.isStringLiteral(init)) return [{ node: init, text: init.text, kind: name }];

  return ts.isJsxExpression(init) && init.expression ? tagged(stringsOf(init.expression), name) : [];
}

const isJsxParent = (node) => ts.isJsxElement(node) || ts.isJsxFragment(node);

function childExpressionStrings(node) {
  const parent = node.parent;
  const inChildren = parent && isJsxParent(parent) && node.expression && !isLiteral(unwrap(node.expression));

  return inChildren ? tagged(stringsOf(node.expression), 'text') : [];
}

function firstTextStart(element) {
  const child = element.children.find((piece) => ts.isJsxText(piece) && piece.text.trim() !== '');

  return child.getStart() + child.text.length - child.text.trimStart().length;
}

function nodeStrings(node) {
  if (isJsxParent(node)) {
    const text = jsxChildrenText(node);

    return text === null ? [] : [{ node, text, kind: 'text', start: firstTextStart(node) }];
  }

  if (ts.isJsxAttribute(node)) return attributeStrings(node);

  if (ts.isJsxExpression(node)) return childExpressionStrings(node);

  if (ts.isCallExpression(node)) return callStrings(node);

  const key = ts.isPropertyAssignment(node) ? propName(node.name) : null;

  return OBJECT_KEYS.has(key) ? tagged(stringsOf(node.initializer), key) : [];
}

export function extractStrings(source, fileName = 'file.tsx') {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const found = new Map();

  const visit = (node) => {
    for (const hit of nodeStrings(node)) {
      found.set(hit.node.pos, {
        text: normalize(hit.text),
        kind: hit.kind,
        start: hit.start ?? hit.node.getStart(file),
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(file);

  return [...found.values()]
    .filter(({ text }) => isUserFacing(text))
    .map(({ text, kind, start }) => ({ text, kind, line: file.getLineAndCharacterOfPosition(start).line + 1 }));
}
