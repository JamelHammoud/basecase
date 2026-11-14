const COUNT_NAME = /^(n|count|total)$|Count$/;
const NOT_PLURAL = new Set(['always', 'across', 'does', 'fps', 'has', 'its', 'lens', 'plus', 'this', 'was', 'yes']);
const COMPARES = new Set(['===', '!==', '==', '!=', '>', '<=']);
const SUFFIXES = new Set(['s', 'es']);

const nameOf = (node) => {
  if (node.type === 'Identifier') return node.name;

  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }

  return null;
};

const isCount = (node) => {
  const name = node && nameOf(node);

  if (!name) return false;

  return (node.type === 'MemberExpression' && name === 'length') || COUNT_NAME.test(name);
};

const isPluralWord = (word) =>
  word.length >= 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word) && !NOT_PLURAL.has(word);

const pluralAfter = (text) => {
  const [first, second] = /^ ([A-Za-z]+)(?: ([a-z]+)\b)?/.exec(text)?.slice(1) ?? [];
  const word = [first, second].find((w) => w && isPluralWord(w.toLowerCase()));

  return word ?? null;
};

const stringOf = (node) => {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;

  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;

  return null;
};

const comparesToOne = (test) =>
  test.type === 'BinaryExpression' &&
  COMPARES.has(test.operator) &&
  [test.left, test.right].some((side) => side.type === 'Literal' && side.value === 1);

const isSuffixChoice = (node) => {
  const texts = [stringOf(node.consequent), stringOf(node.alternate)];

  return texts.includes('') && texts.some((t) => SUFFIXES.has(t));
};

const isWordChoice = (node) => {
  const texts = [stringOf(node.consequent), stringOf(node.alternate)];

  return texts.every((t) => t !== null) && texts.some((t) => isPluralWord(t.split(' ').at(-1) ?? ''));
};

const isCountedWordChoice = (node) =>
  node?.type === 'ConditionalExpression' && comparesToOne(node.test) && isWordChoice(node);

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Count things through plural() (§3b-15), never a bare `${n} parts` or a hand-written n === 1 ternary',
    },
    messages: {
      bare: 'Count “{{word}}” through plural(n, …) (electron/plural.mjs, §3b-15), so 1 never reads “1 {{word}}”.',
      ternary: 'Pluralize through plural(n, …) (electron/plural.mjs, §3b-15), not an n === 1 ternary.',
    },
    schema: [],
  },
  create(context) {
    return {
      TemplateLiteral(node) {
        node.expressions.forEach((expression, i) => {
          if (!isCount(expression)) return;

          const after = node.quasis[i + 1].value.cooked ?? '';
          const word = pluralAfter(after);
          const next = node.expressions[i + 1];

          if (word) context.report({ node: expression, messageId: 'bare', data: { word } });
          else if (after === ' ' && isCountedWordChoice(next)) context.report({ node: next, messageId: 'ternary' });
        });
      },
      ConditionalExpression(node) {
        if (comparesToOne(node.test) && isSuffixChoice(node)) context.report({ node, messageId: 'ternary' });
      },
      JSXExpressionContainer(node) {
        if (!isCount(node.expression)) return;

        const siblings = node.parent?.children ?? [];
        const next = siblings[siblings.indexOf(node) + 1];
        const word = next?.type === 'JSXText' ? pluralAfter(next.value) : null;

        if (word) context.report({ node: node.expression, messageId: 'bare', data: { word } });
      },
    };
  },
};
