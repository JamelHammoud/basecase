import type { Command } from '../components/CommandPalette';
import { AlertIcon, DownloadIcon, ShareIcon, TrainIcon } from '../design-system';
import type { SkillRow } from '../skills/skillRows';
import { titleCase } from '../utils/titleCase';
import type { CommandInputs } from './sceneCommands';
import type { WorkspaceCore } from './useWorkspaceCore';

const ic = 'w-4 h-4';

const STRESS_WORDS =
  'robustness robust friction slippery tile floor mass weight heavier payload servo strength weaker latency delay lag domain randomization failure fails edge case sim to real';

function rowCommands(core: WorkspaceCore, row: SkillRow): Command[] {
  const { skills } = core.simTraining;
  const inSim = (run: () => void) => () => {
    core.tool.setRightTab('sim');
    run();
  };
  const stress: Command = {
    id: `skill-stress-${row.target}`,
    group: 'Simulate',
    label: titleCase(`Stress ${row.label}`),
    icon: <AlertIcon className={ic} />,
    keywords: STRESS_WORDS,
    run: inSim(() => void skills.stress(row)),
  };
  const retrain: Command = {
    id: `skill-train-stress-${row.target}`,
    group: 'Simulate',
    label: titleCase(`Train ${row.label} on These`),
    icon: <TrainIcon className={ic} />,
    keywords: `retrain findings ${STRESS_WORDS}`,
    run: inSim(() => void skills.trainOnFindings(row)),
  };

  return [stress, ...(skills.canTrainOnFindings(row) ? [retrain] : [])];
}

function stressCommands(core: WorkspaceCore): Command[] {
  const { skills } = core.simTraining;

  if (!skills.available || skills.busy) return [];

  return skills.rows.filter((row) => row.state.kind === 'ready').flatMap((row) => rowCommands(core, row));
}

function hubCommands(core: WorkspaceCore): Command[] {
  const { skillHub } = core.simTraining;
  const install: Command = {
    id: 'skill-install',
    group: 'Simulate',
    label: 'Install Skill',
    icon: <DownloadIcon className={ic} />,
    keywords: 'hugging face hub hf download skill policy motor kit stand walk exchange',
    run: skillHub.openInstall,
  };
  const publish = skillHub.publishable.map((row): Command => ({
    id: `skill-publish-${row.target}`,
    group: 'Simulate',
    label: `Publish ${row.label} to Hugging Face`,
    icon: <ShareIcon className={ic} />,
    keywords: 'hub hf upload share skill policy model onnx',
    run: () => skillHub.publish(row),
  }));

  return [...(skillHub.canInstall ? [install] : []), ...publish];
}

export function skillCommands({ core }: CommandInputs): Command[] {
  return [...stressCommands(core), ...hubCommands(core)];
}
