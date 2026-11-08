import { Button, EmptyState, RoutinesIcon } from '../../design-system';
import { lightFlow, routineToFlow } from '../../routines/flow';
import type { RoutineView } from '../../workspace/routineTypes';
import type { Routines } from '../../workspace/useRoutines';
import { ADD_LABELS } from '../../workspace/routineMount';
import { RoutineFlow } from './RoutineFlow';

export interface RoutinesPanelProps {
  routines: Routines;
  onTrain: (skill: string) => void;
}

function statusOf(view: RoutineView): string {
  if (view.checking) return 'Checking against this robot…';

  if (view.run && !view.run.done) return 'Running in simulation';

  if (view.compiled?.ok) return view.tests?.passed ? 'Ready, every scenario passes' : 'Ready to run';

  return 'Can’t run on this robot';
}

export function RoutinesPanel({ routines, onTrain }: RoutinesPanelProps) {
  const { view, missing } = routines;
  const routine = view.routine;

  if (!routine) {
    return (
      <EmptyState
        icon={<RoutinesIcon className="w-5 h-5" />}
        title="Ask the agent for a Routine"
        description="Say what the robot should do in a sentence, and it becomes a flowchart here."
      />
    );
  }

  const flow = routineToFlow(routine);
  const states = view.run ? lightFlow(flow, view.run.trace).states : {};
  const errors = view.compiled && !view.compiled.ok ? view.compiled.errors : [];
  const general = errors.filter((e) => !e.path || !flow.nodes.some((n) => n.id === e.path));

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="routine-flow">
      <div className="px-[12px] pb-2 flex flex-col gap-1">
        <div className="text-[14px] font-medium text-white/90">{routine.name}</div>
        <div className="text-[12px] text-white/45">{statusOf(view)}</div>
        {general.map((e) => (
          <div key={`${e.code}:${e.message}`} className="text-[12px] text-white/60">
            {e.message}
          </div>
        ))}
        {missing.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {missing.map((c) => (
              <Button
                key={c}
                size="sm"
                variant="primary"
                title={`Put a ${c === 'depth' ? 'depth camera' : c} on the robot`}
                onClick={() => routines.addCapability(c)}
              >
                {ADD_LABELS[c]}
              </Button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <RoutineFlow key={routine.id} flow={flow} states={states} errors={errors} onTrain={onTrain} />
      </div>
    </div>
  );
}
