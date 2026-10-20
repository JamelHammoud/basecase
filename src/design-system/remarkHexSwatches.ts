import { exactHexColor, splitHexColors } from '../utils/hexColors';

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName: string; hProperties: Record<string, string> };
}

export const SWATCH_ATTRIBUTE = 'data-swatch';

const swatch = (color: string): MdNode => ({
  type: 'hexSwatch',
  data: { hName: 'span', hProperties: { dataSwatch: color } },
});

function withSwatches(child: MdNode): MdNode[] {
  if (child.type === 'text') {
    return splitHexColors(child.value ?? '').flatMap((run) =>
      run.color ? [swatch(run.color), { type: 'text', value: run.text }] : [{ type: 'text', value: run.text }],
    );
  }

  const codeColor = child.type === 'inlineCode' ? exactHexColor(child.value ?? '') : null;

  if (codeColor) return [swatch(codeColor), child];

  addSwatches(child);

  return [child];
}

function addSwatches(node: MdNode) {
  if (!node.children || node.type === 'link' || node.type === 'linkReference') return;

  node.children = node.children.flatMap(withSwatches);
}

export const remarkHexSwatches = () => (tree: MdNode) => addSwatches(tree);
