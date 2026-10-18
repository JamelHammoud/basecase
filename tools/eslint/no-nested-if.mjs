const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

const isElseIf = (node) => node.parent?.type === 'IfStatement' && node.parent.alternate === node;

const enclosingIf = (node) => {
  let child = node;
  let current = node.parent;

  while (current && !FUNCTION_TYPES.has(current.type)) {
    if (current.type === 'IfStatement' && !(current.alternate === child && child.type === 'IfStatement')) {
      return current;
    }

    child = current;
    current = current.parent;
  }

  return null;
};

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow if statements nested inside other if statements in the same function' },
    messages: {
      nested: 'Avoid nested if statements. Use an early return, combine the conditions, or extract a function.',
    },
    schema: [],
  },
  create(context) {
    return {
      IfStatement(node) {
        if (isElseIf(node)) {
          return;
        }

        if (enclosingIf(node)) {
          context.report({ node, messageId: 'nested' });
        }
      },
    };
  },
};
