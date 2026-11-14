import React from 'react';
import { DisclosureRow } from '../../../design-system';
import type { TreeNode } from '../../../topics/messageTree';
import { opensAtFirst } from './topicRows';

const INDENT = 12;

export interface TreeOpening {
  flipped: ReadonlySet<string>;
  flip: (path: string) => void;
}

interface RowsProps {
  nodes: TreeNode[];
  depth: number;
  path: string;
  opening: TreeOpening;
}

const Leaf: React.FC<{ node: TreeNode; depth: number }> = ({ node, depth }) => (
  <div
    className="min-h-[28px] py-[5px] flex items-start gap-3 text-[13px] leading-[18px]"
    style={{ paddingLeft: depth * INDENT + 7 }}
  >
    <span className="shrink-0 text-white/60">{node.key}</span>
    <span className="min-w-0 flex-1 text-right break-all tabular-nums text-white/90">{node.value}</span>
  </div>
);

export const MessageTreeRows: React.FC<RowsProps> = ({ nodes, depth, path, opening }) => (
  <>
    {nodes.map((node) => {
      const at = `${path}/${node.key}`;

      if (!node.children) return <Leaf key={at} node={node} depth={depth} />;

      const open = opensAtFirst(node, depth) !== opening.flipped.has(at);

      return (
        <div key={at} data-path={at.slice(1)}>
          <div style={{ paddingLeft: depth * INDENT }}>
            <DisclosureRow open={open} onToggle={() => opening.flip(at)}>
              <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] text-white/60">
                {node.key}
                {!open && <span className="ml-2 tabular-nums text-white/50">{node.children.length}</span>}
              </span>
            </DisclosureRow>
          </div>
          {open && <MessageTreeRows nodes={node.children} depth={depth + 1} path={at} opening={opening} />}
        </div>
      );
    })}
  </>
);
