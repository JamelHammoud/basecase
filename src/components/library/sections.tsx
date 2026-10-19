import React from 'react';
import { Plus } from 'lucide-react';
import { Button, IconButton, SectionHeader, type ContextMenuEntry } from '../../design-system';
import type { CustomModelDefinition, SavedSceneSummary } from '../../types/robotics';
import type { LibraryPanelProps } from '../LibraryPanel';
import { modelMenu, sceneMenu } from './menus';
import { ModelTile } from './ModelTile';
import { NewModelMenu } from './NewModelMenu';
import { SceneTile } from './SceneTile';
import { InlineEmpty } from './Tile';

const GRID = 'grid grid-cols-2 gap-x-[8px] gap-y-[12px] px-[4px]';

export interface SectionState {
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  showMenu: (entries: ContextMenuEntry[]) => (e: React.MouseEvent) => void;
}

const finishRename =
  (state: SectionState, current: string, rename: (name: string) => void) =>
  (name: string) => {
    state.setRenaming(null);

    if (name && name !== current) rename(name);
  };

export const ScenesSection: React.FC<{
  props: LibraryPanelProps;
  scenes: SavedSceneSummary[];
  state: SectionState;
}> = ({ props, scenes, state }) => {
  const openIds = new Set(props.openTabs.map((t) => t.sceneId));
  const tile = (s: SavedSceneSummary) => {
    const isCurrent = s.id === props.currentSceneId;
    const isOpen = openIds.has(s.id);
    const menu = sceneMenu({
      scene: s,
      isCurrent,
      isOpen,
      onOpen: () => props.onOpenScene(s),
      onRename: () => state.setRenaming(s.id),
      onDuplicate: () => props.onDuplicateScene(s),
      onDelete: () => props.onDeleteScene(s),
    });

    return (
      <SceneTile
        key={s.id}
        scene={s}
        isCurrent={isCurrent}
        isOpen={isOpen}
        renaming={state.renaming === s.id}
        onOpen={() => props.onOpenScene(s)}
        onRename={finishRename(state, s.name, (name) => props.onRenameScene(s, name))}
        onStartRename={() => state.setRenaming(s.id)}
        onMenu={state.showMenu(menu)}
      />
    );
  };

  return (
    <section className="mb-3">
      <SectionHeader
        title="Scenes"
        action={
          <IconButton
            icon={<Plus className="w-3.5 h-3.5" />}
            title="Save this scene"
            shortcut="⌘S"
            size="xs"
            onClick={props.onSaveScene}
          />
        }
      />
      {scenes.length === 0 ? (
        <InlineEmpty
          title="No saved scenes"
          action={
            <Button size="sm" onClick={props.onSaveScene}>
              Save This Scene
            </Button>
          }
        />
      ) : (
        <div className={GRID}>{scenes.map(tile)}</div>
      )}
    </section>
  );
};

const EmptyModelsAction: React.FC<{ props: LibraryPanelProps }> = ({ props }) =>
  props.selectedIds.length > 0 ? (
    <Button size="sm" onClick={() => props.onSaveModel('selected')}>
      Save Selection
    </Button>
  ) : (
    <Button size="sm" onClick={props.onImportSvg}>
      Import SVG…
    </Button>
  );

export const ModelsSection: React.FC<{
  props: LibraryPanelProps;
  models: CustomModelDefinition[];
  state: SectionState;
}> = ({ props, models, state }) => {
  const tile = (m: CustomModelDefinition) => (
    <ModelTile
      key={m.id}
      model={m}
      renaming={state.renaming === m.id}
      onInsert={() => props.onInsertModel(m)}
      onRename={finishRename(state, m.name, (name) => props.onRenameModel(m, name))}
      onStartRename={() => state.setRenaming(m.id)}
      onMenu={state.showMenu(
        modelMenu({
          model: m,
          onInsert: () => props.onInsertModel(m),
          onRename: () => state.setRenaming(m.id),
          onDuplicate: () => props.onDuplicateModel(m),
          onDelete: () => props.onDeleteModel(m),
        }),
      )}
    />
  );

  return (
    <section className="mb-3">
      <SectionHeader
        title="Models"
        action={
          <NewModelMenu
            canSaveSelection={props.selectedIds.length > 0}
            canSaveScene={props.parts.length > 0}
            onSaveModel={props.onSaveModel}
            onImportSvg={props.onImportSvg}
            onImageToModel={props.onImageToModel}
          />
        }
      />
      {models.length === 0 ? (
        <InlineEmpty title="No models" action={<EmptyModelsAction props={props} />} />
      ) : (
        <div className={GRID}>{models.map(tile)}</div>
      )}
    </section>
  );
};
