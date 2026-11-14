import type { ReactNode } from 'react';
import type { Command } from '../components/CommandPalette';
import { CoachIcon, CompareIcon, UndoIcon } from '../design-system';
import type { SkillRow } from '../skills/skillRows';
import type { CommandInputs } from './sceneCommands';
import { titleCase } from '../utils/titleCase';
import { canCoach } from './useSkillCoach';

const ic = 'w-4 h-4';

export function coachCommands({ core }: CommandInputs): Command[] {
  const { skills } = core.simTraining;
  const { coach } = skills;
  const command = (row: SkillRow, verb: string, icon: ReactNode, act: () => void): Command => ({
    id: `${verb.toLowerCase().replace(' ', '-')}-${row.target}`,
    group: 'Simulate',
    label: titleCase(`${verb} ${row.label}`),
    icon,
    keywords: 'coach skill style reward teach train',
    run: () => {
      core.tool.openRightTab('sim');
      act();
    },
  });
  const coached = skills.rows.filter((row) => row.record?.coach && row.state.kind === 'ready');

  return [
    ...skills.rows
      .filter(canCoach)
      .map((row) => command(row, 'Coach', <CoachIcon className={ic} />, () => coach.start(row))),
    ...coached.map((row) => command(row, 'Compare', <CompareIcon className={ic} />, () => void coach.replay(row))),
    ...coached
      .filter(coach.canUndo)
      .map((row) => command(row, 'Undo Coach', <UndoIcon className={ic} />, () => coach.undo(row))),
  ];
}
