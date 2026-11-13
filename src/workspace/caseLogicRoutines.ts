import type { Case } from '../cases/schema';
import type { Routine } from '../routines/schema';
import type { ProjectSettings } from '../types/robotics';

const NO_ROUTINES: Routine[] = [];

type Held = Pick<ProjectSettings, 'routines' | 'cases'>;

export function caseLogicIds(project: Held): Set<string> {
  const own = new Set((project.routines ?? []).map((r) => r.id));

  return new Set((project.cases ?? []).flatMap((c) => (c.logic && !own.has(c.logic.id) ? [c.logic.id] : [])));
}

export function routinesView(project: Held): Routine[] {
  const ids = caseLogicIds(project);
  const logics = (project.cases ?? []).flatMap((c) => (c.logic && ids.has(c.logic.id) ? [c.logic] : []));
  const routines = project.routines ?? NO_ROUTINES;

  return logics.length ? [...routines, ...logics] : routines;
}

function withLogic(kase: Case, logic: Routine | undefined): Case {
  if (logic) return { ...kase, logic };

  const rest = { ...kase };

  delete rest.logic;

  return rest;
}

export function writeRoutines<P extends Held>(project: P, list: readonly Routine[]): P {
  const owned = caseLogicIds(project);
  const routines = list.filter((r) => !owned.has(r.id));
  const cases = project.cases?.map((c) =>
    c.logic && owned.has(c.logic.id)
      ? withLogic(
          c,
          list.find((r) => r.id === c.logic?.id),
        )
      : c,
  );

  return { ...project, routines: routines.length ? routines : undefined, ...(cases ? { cases } : {}) };
}

export const isCaseLogic = (project: Held, id: string | undefined) => !!id && caseLogicIds(project).has(id);
