import React from 'react';
import type { SavedSceneSummary } from '../../types/robotics';
import { PreviewImage, RenameField } from '../../design-system';
import { timeAgo } from '../../utils/timeAgo';
import { TILE_RENAME } from '../library/Tile';
import { partCount } from './partCount';
import { useScenePreview } from './useScenePreview';

export interface SceneRowProps {
  scene: SavedSceneSummary;
  current: boolean;
  highlighted: boolean;
  renaming: boolean;
  onOpen: () => void;
  onRename: (name: string | null) => void;
  onMenu: (e: React.MouseEvent) => void;
  onHover: () => void;
}

const rowFill = (current: boolean, highlighted: boolean) => {
  if (current) return 'bg-white/[0.08]';

  return highlighted ? 'bg-white/[0.05]' : '';
};

export const SceneRow: React.FC<SceneRowProps> = ({
  scene,
  current,
  highlighted,
  renaming,
  onOpen,
  onRename,
  onMenu,
  onHover,
}) => {
  const thumb = useScenePreview(scene);

  return (
    <div
      data-scene-row={scene.id}
      onContextMenu={onMenu}
      onPointerMove={onHover}
      className={`group relative h-[52px] flex items-center gap-[10px] pl-[6px] pr-[10px] rounded-[10px] transition-colors duration-150 ${rowFill(current, highlighted)}`}
    >
      {!renaming && (
        <button
          type="button"
          role="menuitem"
          onClick={onOpen}
          aria-current={current || undefined}
          aria-label={scene.name}
          className="absolute inset-0 rounded-[10px] cursor-default"
        />
      )}
      <span className="preview preview-sm relative pointer-events-none shrink-0 w-[53px] h-[40px]">
        <PreviewImage src={thumb} className="absolute inset-0 p-[3px]" />
      </span>
      <span className="relative flex-1 min-w-0 pointer-events-none">
        {renaming ? (
          <span className="block pointer-events-auto">
            <RenameField name={scene.name} onDone={onRename} className={TILE_RENAME} />
          </span>
        ) : (
          <span
            className={`block truncate text-[13px] leading-[19px] ${current ? 'font-medium text-white/95' : 'text-white/85'}`}
          >
            {scene.name}
          </span>
        )}
        <span className="block text-[12px] leading-[17px] text-white/50 tabular-nums truncate">
          {partCount(scene.partCount)}
        </span>
      </span>
      <span className="relative pointer-events-none shrink-0 text-[12px] tabular-nums text-white/50">
        {timeAgo(scene.updatedAt)}
      </span>
    </div>
  );
};
