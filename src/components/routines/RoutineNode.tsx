import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { Button } from '../../design-system';
import { nodeLabel } from '../../routines/flowLabels';
import type { FlowNode, NodeState } from '../../routines/flowTypes';

export interface RoutineNodeData extends Record<string, unknown> {
  node: FlowNode;
  state: NodeState | '';
  problems: string[];
  needsTraining: boolean;
  onTrain: (skill: string) => void;
}

const STATE_FILL: Record<NodeState | '', string> = {
  '': 'bg-white/[0.06]',
  idle: 'bg-white/[0.06]',
  active: 'bg-[#0d99ff]/25 ring-2 ring-[#0d99ff]',
  done: 'bg-white/[0.13]',
  then: 'bg-white/[0.13]',
  else: 'bg-white/[0.13]',
  failed: 'bg-white/[0.06] opacity-70',
  timedOut: 'bg-white/[0.06] opacity-70',
  cancelled: 'bg-white/[0.06] opacity-50',
};

const STATE_WORD: Partial<Record<NodeState, string>> = {
  failed: 'Failed',
  timedOut: 'Ran out of time',
  cancelled: 'Stopped',
  then: 'Yes',
  else: 'No',
};

const HANDLE = 'opacity-0! pointer-events-none!';

export function RoutineNode({ data }: NodeProps<Node<RoutineNodeData>>) {
  const { node, state, problems, needsTraining, onTrain } = data;

  if (node.kind === 'end') {
    return (
      <div data-flow-node={node.id} className="w-[14px] h-[14px] rounded-full bg-white/20">
        <Handle type="target" position={Position.Top} className={HANDLE} isConnectable={false} />
      </div>
    );
  }

  const label = nodeLabel(node);
  const word = state ? STATE_WORD[state] : undefined;
  const skill = String(node.data.skill ?? node.id);

  return (
    <div
      data-flow-node={node.id}
      data-state={state}
      className={`w-[196px] min-h-[56px] rounded-[10px] px-3 py-2 flex flex-col gap-0.5 transition-colors duration-150 ${STATE_FILL[state]}`}
    >
      <Handle type="target" position={Position.Top} className={HANDLE} isConnectable={false} />
      <div className="flex items-center justify-between text-[12px] text-white/45">
        <span>{label.kind}</span>
        {word && <span className="text-white/60">{word}</span>}
      </div>
      <div className="text-[13px] leading-[18px] text-white/90 line-clamp-2">{label.text}</div>
      {problems.map((p) => (
        <div key={p} className="text-[12px] leading-[16px] text-white/60">
          {p}
        </div>
      ))}
      {needsTraining && (
        <Button
          size="xs"
          variant="secondary"
          className="mt-1 self-start nodrag"
          title={`Train ${skill} in Simulate`}
          onClick={() => onTrain(skill)}
        >
          Needs Training
        </Button>
      )}
      <Handle type="source" position={Position.Bottom} className={HANDLE} isConnectable={false} />
    </div>
  );
}
