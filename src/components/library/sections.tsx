import React from 'react';
import { Button, SectionHeader, type ContextMenuEntry } from '../../design-system';
import type { CustomModelDefinition } from '../../types/robotics';
import type { LibraryPanelProps } from '../LibraryPanel';
import { modelMenu } from './menus';
import { ModelTile } from './ModelTile';
import { NewModelMenu } from './NewModelMenu';
import { InlineEmpty } from './Tile';

const GRID = 'grid grid-cols-2 gap-x-[8px] gap-y-[12px] px-[4px]';

export interface SectionState {
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  menuFor: string | null;
  showMenu: (id: string, entries: ContextMenuEntry[]) => (e: React.MouseEvent) => void;
}

const finishRename =
  (state: SectionState, current: string, rename: (name: string) => void) =>
  (name: string) => {
    state.setRenaming(null);

    if (name && name !== current) rename(name);
  };

const EmptyModelsAction: React.FC<{ props: LibraryPanelProps }> = ({ props }) =>
  props.selectedIds.length > 0 ? (
    <Button size="sm" onClick={() => props.onSaveModel('selected')}>
      Save Selection
    </Button>
  ) : (
    <Button size="sm" onClick={props.onImportSvg}>
      Import SVG
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
      menuOpen={state.menuFor === m.id}
      onMenu={state.showMenu(
        m.id,
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
