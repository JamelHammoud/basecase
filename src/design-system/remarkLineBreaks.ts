interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

const withBreaks = (child: MdNode): MdNode[] => {
  if (child.type !== 'text') {
    addBreaks(child);

    return [child];
  }

  return (child.value ?? '')
    .split('\n')
    .flatMap((line, i) => (i ? [{ type: 'break' }, { type: 'text', value: line }] : [{ type: 'text', value: line }]));
};

function addBreaks(node: MdNode) {
  if (!node.children) return;

  node.children = node.children.flatMap(withBreaks);
}

export const remarkLineBreaks = () => (tree: MdNode) => addBreaks(tree);
