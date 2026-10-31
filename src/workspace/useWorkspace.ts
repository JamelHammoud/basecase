import type { SceneWorkspaceProps } from './types';
import { useAgentSession } from './useAgentSession';
import { useCanvasDrop } from './useCanvasDrop';
import { useCanvasMenu } from './useCanvasMenu';
import { useClipboard } from './useClipboard';
import { useDevStudioHook } from './useDevStudioHook';
import { useGuideAutoUpdate } from './useGuideAutoUpdate';
import { useMenuCommands } from './useMenuCommands';
import { useWorkspaceActions } from './useWorkspaceActions';
import { useWorkspaceCore } from './useWorkspaceCore';
import { useWorkspaceHost } from './useWorkspaceHost';
import { useWorkspaceKeys } from './useWorkspaceKeys';
import { useWorkspaceUi } from './useWorkspaceUi';

export function useWorkspace({ workspaceId, active, seed, studio }: SceneWorkspaceProps) {
  const core = useWorkspaceCore({ workspaceId, seed, studio });
  const actions = useWorkspaceActions(core);
  const ui = useWorkspaceUi(core);
  const clipboard = useClipboard({
    core,
    ops: actions.ops,
    active,
    blocked: ui.paletteOpen || studio.settingsOpen,
    addImagePlane: actions.creation.addImagePlane,
  });
  const agent = useAgentSession({
    core,
    seed,
    active,
    robots: actions.robots,
    placeCustomModel: actions.creation.placeCustomModel,
  });
  const canvasMenu = useCanvasMenu(core, agent.controls.stopFollowing);
  const drop = useCanvasDrop(core, actions);

  useGuideAutoUpdate({ guide: core.guide, enabled: studio.autoGuide, agentBusy: agent.busy });
  useWorkspaceKeys({ active, core, actions, ui });
  useMenuCommands({ active, core, actions, ui });
  useDevStudioHook({ active, core, actions, agent });

  const rightIslandRef = useWorkspaceHost({ active, seed, core, agent });

  return { core, actions, ui, clipboard, agent, canvasMenu, drop, rightIslandRef };
}
