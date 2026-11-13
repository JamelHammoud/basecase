import { useRef } from 'react';
import { Button, EmptyState, PlusIcon, RoutinesIcon } from '../../design-system';
import { insertPoints } from '../../routines/edit';
import { lightFlow, routineToFlow } from '../../routines/flow';
import type { RoutineError } from '../../routines/schema';
import { ADD_LABELS } from '../../workspace/routineMount';
import type { RoutineView } from '../../workspace/routineTypes';
import type { Routines } from '../../workspace/useRoutines';
import { EditorContext } from './editorContext';
import { RoutineFlow } from './RoutineFlow';
import { RoutineHeader } from './RoutineHeader';
import { StepPanel } from './StepPanel';
import { useRoutineKeys } from './useRoutineKeys';

export interface RoutinesPanelProps {
  routines: Routines;
  onTrain: (skill: string) => void;
}

function statusOf(view: RoutineView, nodeErrors: number): string {
  if (view.checking) return 'Checking against this robot…';

  if (view.run && !view.run.done) return 'Running in simulation';

  if (view.compiled?.ok) return view.tests?.passed ? 'Every scenario passes' : '';

  if (nodeErrors > 0) return `Fix ${nodeErrors} ${nodeErrors === 1 ? 'step' : 'steps'} to run`;

  return '';
}

export function RoutinesPanel({ routines, onTrain }: RoutinesPanelProps) {
  const { view, missing, store, editor } = routines;
  const routine = view.routine;
  const rootRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useRoutineKeys(routines, rootRef);

  if (!routine) {
    return (
      <EmptyState
        icon={<RoutinesIcon className="w-5 h-5" />}
        title="No routines"
        action={
          <Button variant="primary" size="sm" icon={<PlusIcon className="w-4 h-4" />} onClick={() => store.create()}>
            New Routine
          </Button>
        }
      />
    );
  }

  const flow = routineToFlow(routine);
  const points = new Map(insertPoints(routine).map((p) => [p.key, p]));
  const states = view.run ? lightFlow(flow, view.run.trace).states : {};
  const errors: RoutineError[] = view.compiled && !view.compiled.ok ? view.compiled.errors : [];
  const ids = new Set(flow.nodes.map((n) => n.id));
  const general = errors.filter((e) => !e.path || !ids.has(e.path));
  const status = statusOf(view, new Set(errors.filter((e) => e.path && ids.has(e.path)).map((e) => e.path)).size);
  const failures = view.run?.done ? view.run.failures : [];
  const context = { editor, routine, skills: view.kit?.skills ?? [], points, onTrain };

  return (
    <EditorContext value={context}>
      <div
        ref={rootRef}
        tabIndex={-1}
        data-own-edits
        data-testid="routine-flow"
        onKeyDown={onKeyDown}
        className="flex-1 min-h-0 flex flex-col outline-none"
      >
        <RoutineHeader routines={routines} />
        <div className="px-[12px] pb-2 flex flex-col gap-1">
          {status && <div className="text-[12px] text-white/50">{status}</div>}
          {[...general, ...failures.map((message) => ({ code: 'run', message }))].map((e) => (
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
          <RoutineFlow key={routine.id} flow={flow} states={states} errors={errors} />
        </div>
        <StepPanel flow={flow} />
      </div>
    </EditorContext>
  );
}
