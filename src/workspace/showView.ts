import type { LeftTab } from '../components/LeftSidebar';
import type { PartsReveal } from '../components/PartsPanel';
import type { WorkspaceCore } from './useWorkspaceCore';

export const showPartsSection = (core: WorkspaceCore, section: PartsReveal['section']) => {
  core.tool.revealPartsSection(section);
  core.studio.setIsLeftOpen(true);
};

export const showLeftTab = (core: WorkspaceCore, tab: LeftTab) => {
  core.tool.setLeftTab(tab);
  core.studio.setIsLeftOpen(true);
};
