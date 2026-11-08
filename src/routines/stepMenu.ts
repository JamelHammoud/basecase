import { type RoutineEdit, type StepAt, RoutineIndex, uniqueStepId } from './edit';
import { childContainers } from './editLocate';
import { MODEL_NODES } from './nodes';
import { skillId, skillLabel } from './skillNames';
import type { Routine, SkillContract, Step } from './schema';
import {
  askStep,
  driveStep,
  ifStep,
  inferStep,
  sayStep,
  skillStep,
  stopStep,
  togetherStep,
  turnStep,
  waitStep,
  watcherFor,
} from './stepFactory';

export { skillId, skillLabel } from './skillNames';

export type StepGroup = 'Move' | 'Skills' | 'Talk' | 'Logic' | 'Senses';
export type StepIcon =
  | 'drive'
  | 'turn'
  | 'stop'
  | 'skill'
  | 'anySkill'
  | 'say'
  | 'ask'
  | 'wait'
  | 'if'
  | 'repeat'
  | 'together'
  | 'see'
  | 'hear';

export interface StepChoice {
  key: string;
  group: StepGroup;
  label: string;
  icon: StepIcon;
  detail?: string;
  make: (routine: Routine, at: StepAt) => RoutineEdit[];
}

export const STEP_GROUPS: readonly StepGroup[] = ['Move', 'Skills', 'Talk', 'Logic', 'Senses'];

const MOVE_SKILLS = new Set(['walk', 'turn-away', 'settle']);
const PERCEPTION_HIDDEN = new Set(['speech-out', 'face-embedding']);

const insert = (step: Step, at: StepAt): RoutineEdit => ({ op: 'insert', at, step });

const simple =
  (build: (id: string) => Step | null, idBase: string) =>
  (routine: Routine, at: StepAt): RoutineEdit[] => {
    const step = build(uniqueStepId(routine, idBase));

    return step ? [insert(step, at)] : [];
  };

export function skillChoice(skill: string, holds: SkillContract['holds'] = ['body']): StepChoice {
  const id = skillId(skill);

  return {
    key: `skill:${id}`,
    group: 'Skills',
    label: skillLabel(id),
    icon: 'skill',
    make: (routine, at) => [insert(skillStep(uniqueStepId(routine, id), id, holds), at)],
  };
}

function freshCopy(step: Step, routine: Routine): Step {
  const copy = structuredClone(step);
  const index = new RoutineIndex(routine);
  const taken = new Set(index.ids());
  const rename = (s: Step) => {
    if (s.id !== undefined) {
      const base = s.id.replace(/\d+$/, '') || 'step';
      let n = 2;

      while (taken.has(`${base}${n}`)) n += 1;

      s.id = `${base}${n}`;
      taken.add(s.id);
    }

    for (const child of childContainers(s, '')) child.steps.forEach(rename);
  };

  rename(copy);

  return copy;
}

export function stepAbove(routine: Routine, at: StepAt): Step | null {
  const container = new RoutineIndex(routine).container(at.seq);

  return container?.steps[at.index - 1] ?? null;
}

function repeatChoice(routine: Routine, at: StepAt): StepChoice | null {
  const above = stepAbove(routine, at);

  if (!above) return null;

  return {
    key: 'repeat',
    group: 'Logic',
    label: 'Repeat',
    icon: 'repeat',
    make: (current, where) => [insert(freshCopy(above, current), where)],
  };
}

const ifChoice: StepChoice = {
  key: 'if',
  group: 'Logic',
  label: 'If',
  icon: 'if',
  make: (routine, at) => {
    const watcher = watcherFor('person');
    const step = ifStep(uniqueStepId(routine, 'if'), 'person');

    return [...(watcher ? [{ op: 'addWatcher' as const, watcher }] : []), insert(step, at)];
  },
};

const FIXED: readonly StepChoice[] = [
  { key: 'drive', group: 'Move', label: 'Drive', icon: 'drive', make: simple((id) => driveStep(id), 'drive') },
  { key: 'turn', group: 'Move', label: 'Turn', icon: 'turn', make: simple((id) => turnStep(id), 'turn') },
  { key: 'stop', group: 'Move', label: 'Stop', icon: 'stop', make: simple((id) => stopStep(id), 'stop') },
  { key: 'say', group: 'Talk', label: 'Say', icon: 'say', make: simple(sayStep, 'say') },
  { key: 'ask', group: 'Talk', label: 'Ask', icon: 'ask', make: simple(askStep, 'ask') },
  { key: 'wait', group: 'Logic', label: 'Wait', icon: 'wait', make: simple((id) => waitStep(id), 'wait') },
  ifChoice,
  { key: 'together', group: 'Logic', label: 'Together', icon: 'together', make: simple(togetherStep, 'together') },
];

const senseChoices = (): StepChoice[] =>
  MODEL_NODES.filter((m) => m.tier === 'perception' && !PERCEPTION_HIDDEN.has(m.id)).map((m) => ({
    key: `sense:${m.id}`,
    group: 'Senses',
    label: m.label,
    icon: m.inputs.includes('audio') ? 'hear' : 'see',
    make: simple((id) => inferStep(id, m.id), m.id),
  }));

export function stepChoices(options: { routine: Routine; at: StepAt; skills: readonly SkillContract[] }): StepChoice[] {
  const { routine, at, skills } = options;
  const own = skills.filter((s) => !MOVE_SKILLS.has(s.id)).map((s) => skillChoice(s.id, s.holds));
  const repeat = repeatChoice(routine, at);
  const logic = FIXED.filter((c) => c.group === 'Logic');

  return [
    ...FIXED.filter((c) => c.group === 'Move'),
    ...own,
    ...FIXED.filter((c) => c.group === 'Talk'),
    ...logic.slice(0, 2),
    ...(repeat ? [repeat] : []),
    ...logic.slice(2),
    ...senseChoices(),
  ];
}
