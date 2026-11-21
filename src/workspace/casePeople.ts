import { addPerson, removePerson, replacePerson } from '../cases/personAuthoring';
import { MAX_PEOPLE } from '../cases/personEncounter';
import type { Case, WorldObject } from '../cases/schema';
import { confirmAction } from '../design-system/confirmStore';
import type { ProjectSettings } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import type { Setter } from './types';
import type { ShowToast } from './types';
import type { CaseTry } from './useCaseTry';
import type { Simulation } from '../sim/useSimulation';
import type { TryTimeline } from './useTryTimeline';

interface PeopleOptions {
  active: Case | null;
  attempt: CaseTry;
  realTry: { phase: string };
  timeline: TryTimeline;
  sim: Simulation;
  setProject: Setter<ProjectSettings>;
  stage: (kase: Case) => void;
  showToast: ShowToast;
}

export function casePeople({ active, attempt, realTry, timeline, sim, setProject, stage, showToast }: PeopleOptions) {
  const disabled = attempt.phase !== 'idle' || realTry.phase !== 'idle' || !!timeline.record || sim.drive.active;
  const objects = active?.world.objects.filter((object) => object.person) ?? [];
  const commit = (edit: (kase: Case) => Case) => {
    if (!active || disabled) return;

    try {
      const next = edit(active);

      setProject((project) => ({
        ...project,
        cases: (project.cases ?? []).map((kase) => (kase.id === next.id ? next : kase)),
      }));
      stage(next);
    } catch (error: unknown) {
      showToast(errorMessage(error), { tone: 'error' });
    }
  };

  return {
    objects,
    disabled,
    canAdd: !!active && !disabled && objects.length < MAX_PEOPLE,
    add: () => commit(addPerson),
    replace: (person: WorldObject) => commit((kase) => replacePerson(kase, person)),
    remove: (person: WorldObject) =>
      confirmAction({
        title: `Delete ${person.name}?`,
        onConfirm: () => commit((kase) => removePerson(kase, person.id)),
      }),
  };
}

export type CasePeople = ReturnType<typeof casePeople>;
