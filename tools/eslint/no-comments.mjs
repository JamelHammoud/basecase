const PRAGMAS = [/^\s*@vite-ignore\s*$/, /^\s*[#@]__PURE__\s*$/, /^\/\s*<reference\s/, /^\s*@vitest-environment\s/];

const isPragma = (comment) => PRAGMAS.some((pattern) => pattern.test(comment.value));

const jsxContainerOf = (sourceCode, comment) => {
  const node = sourceCode.getNodeByRangeIndex(comment.range[0]);

  if (node?.type === 'JSXEmptyExpression') {
    return node.parent;
  }

  return null;
};

const lineBounds = (text, start, end) => {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = text.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak + 1;

  return { lineStart, lineEnd };
};

const removalRange = (text, start, end) => {
  const { lineStart, lineEnd } = lineBounds(text, start, end);
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);

  if (before.trim() === '' && after.trim() === '') {
    return [lineStart, lineEnd];
  }

  if (after.trim() === '') {
    return [start - (before.length - before.trimEnd().length), end];
  }

  return [start, end];
};

export default {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: { description: 'Disallow comments; code explains itself and docs live in AGENTS.md / docs/' },
    messages: { noComment: 'Remove this comment. Put lasting context in AGENTS.md or docs/.' },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const text = sourceCode.getText();

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type === 'Shebang' || isPragma(comment)) {
            continue;
          }

          const container = jsxContainerOf(sourceCode, comment);
          const [start, end] = container ? container.range : comment.range;

          context.report({
            loc: comment.loc,
            messageId: 'noComment',
            fix: (fixer) => fixer.removeRange(removalRange(text, start, end)),
          });
        }
      },
    };
  },
};
