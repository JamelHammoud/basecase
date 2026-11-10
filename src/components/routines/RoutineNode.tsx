import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { Button, TrainIcon } from '../../design-system';
import { nodeLabel } from '../../routines/flowLabels';
import type { FlowNode, NodeState } from '../../routines/flowTypes';
import { skillLabel } from '../../routines/stepMenu';
import { useEditorContext } from './editorContext';

export interface RoutineNodeData extends Record<string, unknown> {
  node: FlowNode;
  state: NodeState | '';
  problems: string[];
  needsTraining: boolean;
  unproven: boolean;
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

const HIDDEN_HANDLE = 'opacity-0! pointer-events-none!';
const SOURCE_HANDLE =
  'w-2.5! h-2.5! bg-white/60! border-0! opacity-0! group-hover/node:opacity-100! transition-opacity duration-150';

function TrainButton({ skill }: { skill: string }) {
  const { onTrain } = useEditorContext();
  const label = skillLabel(skill);

  return (
    <Button
      size="sm"
      variant="secondary"
      fullWidth
      className="mt-1 h-auto! py-1.5 justify-start! nodrag"
      icon={<TrainIcon className="w-4 h-4" />}
      onClick={() => onTrain(skill)}
    >
      <span className="block text-[12px] font-normal text-white/50">Needs Training</span>
      <span className="block">Train {label}</span>
    </Button>
  );
}

function StopFirstButton({ id }: { id: string }) {
  const { editor } = useEditorContext();

  return (
    <Button size="xs" variant="secondary" className="mt-1 self-start nodrag" onClick={() => editor.stopBefore(id)}>
      Stop First
    </Button>
  );
}

function EndDot({ id }: { id: string }) {
  return (
    <div data-flow-node={id} className="w-[14px] h-[14px] rounded-full bg-white/20">
      <Handle type="target" position={Position.Top} className={HIDDEN_HANDLE} isConnectable={false} />
    </div>
  );
}

export function RoutineNode({ data }: NodeProps<Node<RoutineNodeData>>) {
  const { editor } = useEditorContext();
  const { node, state, problems, needsTraining, unproven } = data;

  if (node.kind === 'end') return <EndDot id={node.id} />;

  const label = nodeLabel(node);
  const word = state ? STATE_WORD[state] : undefined;
  const selected = editor.selected === node.id;
  const ring = selected && state !== 'active' ? 'ring-2 ring-white/70' : '';

  return (
    <div
      data-flow-node={node.id}
      data-state={state}
      aria-selected={selected}
      className={`group/node relative w-[196px] min-h-[56px] rounded-[10px] px-3 py-2 flex flex-col gap-0.5 transition-colors duration-150 ${STATE_FILL[state]} ${ring}`}
    >
      <Handle type="target" position={Position.Top} className={HIDDEN_HANDLE} isConnectable={false} />
      <div className="flex items-center justify-between text-[12px] text-white/50">
        <span>{label.kind}</span>
        {word && <span className="text-white/60">{word}</span>}
      </div>
      <div className="text-[13px] leading-[18px] text-white/90 line-clamp-2">{label.text}</div>
      {problems.map((p) => (
        <div key={p} className="text-[12px] leading-[16px] text-white/60">
          {p}
        </div>
      ))}
      {needsTraining && <TrainButton skill={String(node.data.skill ?? node.id)} />}
      {unproven && <StopFirstButton id={node.id} />}
      <Handle type="source" position={Position.Bottom} className={SOURCE_HANDLE} />
      {node.kind === 'if' && (
        <>
          <Handle id="then" type="source" position={Position.Left} className={SOURCE_HANDLE} />
          <Handle id="else" type="source" position={Position.Right} className={SOURCE_HANDLE} />
        </>
      )}
    </div>
  );
}
