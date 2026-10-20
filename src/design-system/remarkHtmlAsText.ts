interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

const FLOW_PARENTS = new Set(['root', 'blockquote', 'listItem']);

function asText(node: MdNode, parent: MdNode): MdNode {
  if (node.type !== 'html') {
    showHtml(node);

    return node;
  }

  const text = { type: 'text', value: node.value ?? '' };

  return FLOW_PARENTS.has(parent.type) ? { type: 'paragraph', children: [text] } : text;
}

function showHtml(node: MdNode) {
  if (!node.children) return;

  node.children = node.children.map((child) => asText(child, node));
}

export const remarkHtmlAsText = () => (tree: MdNode) => showHtml(tree);
