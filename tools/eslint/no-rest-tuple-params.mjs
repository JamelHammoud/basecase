const ARRAY_TYPES = new Set(['Array', 'ReadonlyArray']);

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

const isListType = (annotation) => {
  if (!annotation) {
    return true;
  }

  if (annotation.type === 'TSArrayType') {
    return true;
  }

  return annotation.type === 'TSTypeReference' && ARRAY_TYPES.has(annotation.typeName?.name);
};

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow tuple rest parameters, which hide a long positional parameter list' },
    messages: { tuple: 'Use an options object instead of a tuple rest parameter (max-params is 4).' },
    schema: [],
  },
  create(context) {
    return {
      RestElement(node) {
        if (!FUNCTION_TYPES.has(node.parent?.type) || !node.parent.params.includes(node)) {
          return;
        }

        const tupleLike = node.argument.type === 'ArrayPattern' || !isListType(node.typeAnnotation?.typeAnnotation);

        if (tupleLike) context.report({ node, messageId: 'tuple' });
      },
    };
  },
};
