import { SLASH_COMMANDS, slashText } from '../agent/slashCommands';
import type { Command } from '../components/CommandPalette';
import { SLASH_ICONS } from '../components/agent/slashIcons';
import { CasesIcon, ComposeIcon, PenIcon, PhotoAddIcon } from '../design-system';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { CommandInputs } from './sceneCommands';

const FAILING = new Set(['fail', 'warn']);

function makeItPass({ core }: CommandInputs): Command[] {
  const kase = core.simTraining.cases.active;
  const row = kase && core.readiness.current?.rows.find((r) => r.caseId === kase.id);

  if (!kase || !row || !FAILING.has(row.status)) return [];

  return [
    {
      id: 'agent-make-it-pass',
      group: 'Agent',
      label: 'Make It Pass',
      icon: <CasesIcon />,
      keywords: `/pass ${kase.name} case fix redesign agent`,
      run: () => core.tool.requestCompose(`/pass ${kase.name}`),
    },
  ];
}

const composerCommands = ({ core, agent }: CommandInputs): Command[] => [
  {
    id: 'agent-new-chat',
    group: 'Agent',
    label: 'New Chat',
    icon: <ComposeIcon />,
    keywords: 'conversation fresh start clear context agent composer',
    run: () => {
      core.tool.openRightTab('acp');
      void agent.chat.newChat();
    },
  },
  {
    id: 'agent-attach-images',
    group: 'Agent',
    label: 'Attach Images',
    icon: <PhotoAddIcon />,
    keywords: 'model from image photo picture upload composer',
    run: core.tool.requestAttach,
  },
  {
    id: 'agent-attach-sketch',
    group: 'Agent',
    label: 'Attach Sketch',
    icon: <PenIcon />,
    keywords: 'sketch for agent draw drawing reference composer',
    run: core.tool.requestSketch,
  },
];

export function slashPaletteCommands(inputs: CommandInputs): Command[] {
  if (IS_WEB_DEMO) return [];

  return [
    ...makeItPass(inputs),
    ...composerCommands(inputs),
    ...SLASH_COMMANDS.map((command) => ({
      id: `agent-slash-${command.name}`,
      group: 'Agent',
      label: command.label,
      icon: SLASH_ICONS[command.name],
      keywords: `/${command.name} ${command.keywords} agent`,
      run: () => inputs.core.tool.requestCompose(slashText(command.name)),
    })),
  ];
}
