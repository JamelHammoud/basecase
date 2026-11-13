import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import type { AddNodeData } from './canvasModel';
import { InsertButton } from './InsertButton';

export function AddNode({ data }: NodeProps<Node<AddNodeData>>) {
  return (
    <div className="h-[28px] flex items-center justify-center">
      <Handle type="target" position={Position.Top} className="opacity-0! pointer-events-none!" isConnectable={false} />
      <InsertButton point={data.point} />
    </div>
  );
}
