import { MENU_PATH_FIX, arrowPathIn } from '../copy/menuPath.mjs';

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Join the labels of a menu path with ▸, never an arrow (§3b-23)' },
    messages: { arrow: 'Copy (§3b-23): “{{path}}” joins a menu path with an arrow. {{fix}}' },
    schema: [],
  },
  create(context) {
    const check = (node, text) => {
      const path = typeof text === 'string' ? arrowPathIn(text) : null;

      if (path) context.report({ node, messageId: 'arrow', data: { path, fix: MENU_PATH_FIX } });
    };

    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked);
      },
      JSXText(node) {
        check(node, node.value);
      },
    };
  },
};
