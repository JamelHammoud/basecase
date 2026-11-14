import type { Command } from '../components/CommandPalette';
import { CrosshairIcon, DownloadIcon, ShareIcon } from '../design-system';
import { canStress } from './useSkillStress';
import type { CommandInputs } from './sceneCommands';

export function skillCommands({ core }: CommandInputs): Command[] {
  const { skillHub, skills } = core.simTraining;
  const install: Command = {
    id: 'skill-install',
    group: 'Simulate',
    label: 'Install Skill',
    icon: <DownloadIcon />,
    keywords: 'hugging face hub hf download skill policy motor kit stand walk exchange',
    run: skillHub.openInstall,
  };
  const publish = skillHub.publishable.map((row): Command => ({
    id: `skill-publish-${row.target}`,
    group: 'Simulate',
    label: `Publish ${row.label} to Hugging Face`,
    icon: <ShareIcon />,
    keywords: 'hub hf upload share skill policy model onnx',
    run: () => skillHub.publish(row),
  }));

  const stress = skills.rows.filter(canStress).map((row): Command => ({
    id: `skill-stress-${row.target}`,
    group: 'Simulate',
    label: `Stress ${row.label}`,
    icon: <CrosshairIcon />,
    keywords: 'stress test robust friction weight strength delay latency break fail limits skill',
    run: () => void skills.stress.stress(row),
  }));

  return [...(skillHub.canInstall ? [install] : []), ...publish, ...stress];
}
