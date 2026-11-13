import { CALL_KEYS, CALLS, JSX_PROPS, OBJECT_KEYS } from '../copy/surfaces.mjs';
import { findBannedCopy } from '../copy/banned.mjs';

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

const TEXTS = {
  Literal: (node) => (typeof node.value === 'string' ? [{ node, text: node.value }] : []),
  TemplateLiteral: (node) => node.quasis.map((q) => ({ node: q, text: q.value.cooked ?? '' })),
  ConditionalExpression: (node) => [...textsOf(node.consequent), ...textsOf(node.alternate)],
  LogicalExpression: (node) => [...textsOf(node.left), ...textsOf(node.right)],
  BinaryExpression: (node) => (node.operator === '+' ? [...textsOf(node.left), ...textsOf(node.right)] : []),
  JSXExpressionContainer: (node) => textsOf(node.expression),
  TSAsExpression: (node) => textsOf(node.expression),
  TSSatisfiesExpression: (node) => textsOf(node.expression),
  TSNonNullExpression: (node) => textsOf(node.expression),
};

function textsOf(node) {
  const read = node && TEXTS[node.type];

  return read ? read(node) : [];
}

const callArgumentTexts = (node) =>
  node.type === 'ObjectExpression'
    ? node.properties
        .filter((p) => p.type === 'Property' && CALL_KEYS.has(propertyName(p)))
        .flatMap((p) => textsOf(p.value))
    : textsOf(node);

const JSX_PARENTS = new Set(['JSXElement', 'JSXFragment']);

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow words and separators the copy guide bans (§3c), and synonyms of its glossary (§3b-17), in user-facing strings',
    },
    messages: { banned: 'Copy ({{section}}): “{{word}}” is banned. {{fix}}' },
    schema: [],
  },
  create(context) {
    const reported = new Set();

    const check = (entries) => {
      for (const { node, text } of entries) {
        const hit = !reported.has(node) && findBannedCopy(text);

        if (!hit) continue;

        reported.add(node);
        context.report({ node, messageId: 'banned', data: { word: hit.word, fix: hit.fix, section: hit.section } });
      }
    };

    return {
      JSXText(node) {
        check([{ node, text: node.value }]);
      },
      JSXExpressionContainer(node) {
        if (JSX_PARENTS.has(node.parent?.type)) check(textsOf(node.expression));
      },
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;

        if (JSX_PROPS.has(name)) check(textsOf(node.value));
      },
      Property(node) {
        if (node.parent?.type === 'ObjectExpression' && OBJECT_KEYS.has(propertyName(node))) {
          check(textsOf(node.value));
        }
      },
      CallExpression(node) {
        if (CALLS.has(calleeName(node.callee))) check(node.arguments.flatMap(callArgumentTexts));
      },
    };
  },
};
