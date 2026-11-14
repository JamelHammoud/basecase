import type { Command } from '../components/CommandPalette';
import { CrosshairIcon, TrainIcon } from '../design-system';
import type { SkillRow } from '../skills/skillRows';
import type { CommandInputs } from './sceneCommands';
import { titleCase } from '../utils/titleCase';
import { canStress, canTrainOnFindings } from './useSkillStress';

export function stressCommands({ core }: CommandInputs): Command[] {
  const { skills } = core.simTraining;
  const report = (started: Promise<string | null>) =>
    void started.then((problem) => problem && core.showToast(problem));
  const open = (act: () => void) => () => {
    core.tool.openRightTab('sim');
    act();
  };
  const stress = (row: SkillRow): Command => ({
    id: `stress-${row.target}`,
    group: 'Simulate',
    label: titleCase(`Stress ${row.label}`),
    icon: <CrosshairIcon />,
    keywords: 'stress test break boundary friction mass strength delay robust skill',
    run: open(() => report(skills.stress.run(row))),
  });
  const train = (row: SkillRow): Command => ({
    id: `stress-train-${row.target}`,
    group: 'Simulate',
    label: `Train ${titleCase(row.label)} on These`,
    icon: <TrainIcon />,
    keywords: 'stress findings retrain robust wider ranges',
    run: open(() => report(skills.stress.train(row))),
  });

  return [...skills.rows.filter(canStress).map(stress), ...skills.rows.filter(canTrainOnFindings).map(train)];
}
