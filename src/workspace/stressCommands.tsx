import type { Command } from '../components/CommandPalette';
import { GaugeIcon, TrainIcon } from '../design-system';
import type { CommandInputs } from './sceneCommands';
import { titleCase } from '../utils/titleCase';
import { canStress, canTrainFindings } from './useSkillStress';

export function stressCommands({ core }: CommandInputs): Command[] {
  const { skills } = core.simTraining;
  const open = (act: () => void) => () => {
    core.tool.openRightTab('sim');
    act();
  };

  return [
    ...skills.rows.filter(canStress).map((row): Command => ({
      id: `stress-${row.target}`,
      group: 'Simulate',
      label: titleCase(`Stress ${row.label}`),
      icon: <GaugeIcon />,
      keywords: 'stress test break limits friction mass strength delay robust',
      run: open(() => void skills.stress.start(row)),
    })),
    ...skills.rows.filter(canTrainFindings).map((row): Command => ({
      id: `train-findings-${row.target}`,
      group: 'Simulate',
      label: titleCase(`Train ${row.label} on These`),
      icon: <TrainIcon />,
      keywords: 'stress findings retrain wider ranges robust',
      run: open(() => void skills.stress.train(row)),
    })),
  ];
}
