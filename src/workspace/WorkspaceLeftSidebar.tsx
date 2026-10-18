import { LeftSidebar } from '../components/LeftSidebar';
import { LAYOUT, PanelResizer } from '../design-system';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { WorkspaceUi } from './useWorkspaceUi';

interface WorkspaceLeftSidebarProps {
  core: WorkspaceCore;
  actions: WorkspaceActions;
  ui: WorkspaceUi;
  onPartContextMenu: (id: string, x: number, y: number) => void;
}

export function WorkspaceLeftSidebar({ core, actions, ui, onPartContextMenu }: WorkspaceLeftSidebarProps) {
  const { studio, scene, tool, parts, selectedIds, selection } = core;
  const { library, creation, edits, robots } = actions;
  const { panelWidths } = studio;
  const { openCreator } = tool;
  const libraryProps = {
    currentSceneId: scene.sceneId,
    openTabs: studio.tabs,
    savedScenes: studio.savedScenes,
    customModels: studio.customModels,
    onOpenScene: studio.openScene,
    onSaveScene: library.sync,
    onRenameScene: library.renameScene,
    onDuplicateScene: library.duplicateScene,
    onDeleteScene: library.deleteScene,
    onInsertModel: creation.placeCustomModel,
    onRenameModel: library.renameModel,
    onDuplicateModel: library.duplicateModel,
    onDeleteModel: library.deleteModel,
    onSaveModel: library.saveAsModel,
    onImportSvg: () => openCreator('svg'),
    onImageToModel: tool.requestAttach,
  };

  return (
    <LeftSidebar
      open={studio.isLeftOpen}
      sceneGoal={scene.globalGoal}
      partsSearchRef={ui.partsSearchRef}
      onImportRobot={robots.pickRobot}
      width={panelWidths.left}
      resizing={studio.resizingPanel === 'left'}
      edge={
        <PanelResizer
          edge="right"
          width={panelWidths.left}
          min={LAYOUT.leftPanelMin}
          max={LAYOUT.leftPanelMax}
          defaultWidth={LAYOUT.leftPanelWidth}
          onResize={ui.resizeLeft}
          onCollapse={ui.collapseLeft}
          onResizingChange={ui.resizingLeft}
        />
      }
      tab={tool.leftTab}
      onTabChange={tool.setLeftTab}
      parts={parts}
      selectedIds={selectedIds}
      onSelectPart={selection.select}
      onSelectIds={selection.selectIds}
      onRenameGroup={edits.renameGroup}
      showReferenceImages={studio.showReferenceImages}
      onToggleReferenceImages={ui.toggleReferenceImages}
      onTogglePartFlag={edits.togglePartFlag}
      onRenamePart={edits.renamePart}
      onPartContextMenu={onPartContextMenu}
      onAddCatalogItem={creation.addCatalogItem}
      library={libraryProps}
    />
  );
}
