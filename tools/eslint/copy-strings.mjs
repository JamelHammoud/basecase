import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';

export const SLOT = '{…}';

export const RENDERED_ATTRIBUTES = new Set([
  'label',
  'title',
  'placeholder',
  'aria-label',
  'description',
  'caption',
  'hint',
  'tooltip',
  'message',
  'confirmLabel',
  'emptyLabel',
]);

export const RENDERED_PROPERTIES = new Set([...RENDERED_ATTRIBUTES, 'ariaLabel', 'subtitle', 'detail', 'text']);

export const COPY_CALLS = new Set(['showToast', 'toastInFront', 'toast', 'notify', 'confirmAction']);

const CALL_PROPERTIES = new Set([...RENDERED_PROPERTIES, 'body']);

const JSX_PARENTS = new Set(['JSXElement', 'JSXFragment']);

const calleeName = (callee) => {
  if (callee.type === 'Identifier') return callee.name;

  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') return callee.property.name;

  return null;
};

const propertyName = (node) => {
  if (node.computed) return null;

  if (node.key.type === 'Identifier') return node.key.name;

  return typeof node.key.value === 'string' ? node.key.value : null;
};

const isStringLiteral = (node) =>
  (node?.type === 'Literal' && typeof node.value === 'string') ||
  (node?.type === 'TemplateLiteral' && node.expressions.length === 0);

const literalText = (node) => (node.type === 'Literal' ? node.value : (node.quasis[0].value.cooked ?? ''));

const textsOfObject = (node) =>
  node.properties
    .filter((p) => p.type === 'Property' && CALL_PROPERTIES.has(propertyName(p)))
    .flatMap((p) => textsOf(p.value));

const TEXTS = {
  Literal: (node) => (typeof node.value === 'string' ? [{ node, text: node.value }] : []),
  TemplateLiteral: (node) => [{ node, text: node.quasis.map((q) => q.value.cooked ?? '').join(SLOT) }],
  ConditionalExpression: (node) => [...textsOf(node.consequent), ...textsOf(node.alternate)],
  LogicalExpression: (node) => [...textsOf(node.left), ...textsOf(node.right)],
  BinaryExpression: (node) => (node.operator === '+' ? [...textsOf(node.left), ...textsOf(node.right)] : []),
  JSXExpressionContainer: (node) => textsOf(node.expression),
  TSAsExpression: (node) => textsOf(node.expression),
  ObjectExpression: textsOfObject,
};

export function textsOf(node) {
  const read = node && TEXTS[node.type];

  return read ? read(node) : [];
}

const hasJsxText = (element) => element.children.some((child) => child.type === 'JSXText' && child.value.trim());

function jsxPiece(child) {
  if (child.type === 'JSXText') return child.value;

  if (child.type !== 'JSXExpressionContainer') return SLOT;

  if (child.expression.type === 'JSXEmptyExpression') return '';

  return isStringLiteral(child.expression) ? literalText(child.expression) : SLOT;
}

const jsxText = (element) => element.children.map(jsxPiece).join('');

const tagged = (entries, kind) => entries.map((entry) => ({ ...entry, kind }));

export function copyVisitors(found) {
  const element = (node) => {
    if (hasJsxText(node)) found([{ node, text: jsxText(node), kind: 'text' }]);
  };

  return {
    JSXElement: element,
    JSXFragment: element,
    JSXExpressionContainer(node) {
      if (!JSX_PARENTS.has(node.parent?.type)) return;

      if (hasJsxText(node.parent) && isStringLiteral(node.expression)) return;

      found(tagged(textsOf(node.expression), 'text'));
    },
    JSXAttribute(node) {
      const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;

      if (RENDERED_ATTRIBUTES.has(name)) found(tagged(textsOf(node.value), name));
    },
    Property(node) {
      const name = propertyName(node);

      if (node.parent?.type === 'ObjectExpression' && RENDERED_PROPERTIES.has(name)) {
        found(tagged(textsOf(node.value), name));
      }
    },
    CallExpression(node) {
      const name = calleeName(node.callee);

      if (COPY_CALLS.has(name)) found(tagged(node.arguments.flatMap(textsOf), name));
    },
  };
}

export const normalizeCopy = (text) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\{…\}(?:\s*\{…\})+/g, SLOT)
    .trim();

const UNITS = new Set(['mm', 'cm', 'kg', 'ms', 'px', 'deg', 'rad', 'rpm', 'fps', 'hz', 'mah', 'n·m', 'kg·cm']);
const URL_OR_PATH = /^(?:[a-z]+:\/\/\S+|\S*\/\S+)$/i;
const IDENTIFIER = /^[a-z]\w*(?:[-_.:]\w+)+$|^[a-z]+[A-Z]\w*$/;

export function isUserFacing(text) {
  const words = text.replaceAll(SLOT, ' ').trim();

  if (!/\p{L}{2,}/u.test(words)) return false;

  if (UNITS.has(words.replace(/[\d\s.,]+/g, '').toLowerCase())) return false;

  return !URL_OR_PATH.test(words) && !IDENTIFIER.test(words);
}

const LANGUAGE = { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } };

export function extractCopy(source, filename = 'file.tsx') {
  const seen = new Map();
  const collect = (entries) => {
    for (const { node, text, kind } of entries) {
      if (!seen.has(node)) seen.set(node, { text: normalizeCopy(text), kind, line: node.loc.start.line });
    }
  };
  const plugin = { rules: { strings: { create: () => copyVisitors(collect) } } };
  const config = [
    {
      files: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
      languageOptions: LANGUAGE,
      plugins: { copy: plugin },
      rules: { 'copy/strings': 'error' },
    },
  ];
  const fatal = new Linter({ configType: 'flat' })
    .verify(source, config, { filename })
    .find((message) => message.ruleId === null);

  if (fatal) throw new Error(`${filename}:${fatal.line}: ${fatal.message}`);

  return [...seen.values()].filter(({ text }) => isUserFacing(text)).sort((a, b) => a.line - b.line);
}
