import type { LeftTab } from '../components/LeftSidebar';
import type { WorkspaceCore } from './useWorkspaceCore';

export const showLeftTab = (core: WorkspaceCore, tab: LeftTab) => {
  core.tool.setLeftTab(tab);
  core.studio.setIsLeftOpen(true);
};
