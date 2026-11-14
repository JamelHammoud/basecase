import type { Command } from '../components/CommandPalette';
import { CoachIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';
import { canCoach } from './useSkillCoach';

export function coachCommands({ core }: CommandInputs): Command[] {
  const { skills } = core.simTraining;

  return skills.rows.filter(canCoach).map((row) => ({
    id: `coach-${row.target}`,
    group: 'Simulate',
    label: `Coach ${row.label}`,
    icon: <CoachIcon className="w-4 h-4" />,
    keywords: 'coach skill style reward teach train',
    run: () => {
      core.tool.openRightTab('sim');
      skills.coach.start(row);
    },
  }));
}
