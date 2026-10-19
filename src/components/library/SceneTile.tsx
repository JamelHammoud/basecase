import React from 'react';
import type { SavedSceneSummary } from '../../types/robotics';
import { timeAgo } from '../../utils/timeAgo';
import { SceneDetails } from './details';
import { Tile } from './Tile';
import { useScenePreview } from './useScenePreview';

export const SceneTile: React.FC<{
  scene: SavedSceneSummary;
  isCurrent: boolean;
  isOpen: boolean;
  renaming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onMenu: (e: React.MouseEvent) => void;
}> = ({ scene, isCurrent, isOpen, renaming, onOpen, onStartRename, onRename, onMenu }) => {
  const thumb = useScenePreview(scene);
  const count = scene.partCount;

  return (
    <Tile
      name={scene.name}
      meta={`${count} ${count === 1 ? 'part' : 'parts'} · ${timeAgo(scene.updatedAt)}`}
      thumb={thumb}
      fallback={count ? undefined : 'Empty scene'}
      badge={isOpen ? 'Open' : undefined}
      current={isCurrent}
      openLabel={isOpen && !isCurrent ? 'Show tab' : 'Open'}
      renaming={renaming}
      onOpen={onOpen}
      onStartRename={onStartRename}
      onRename={onRename}
      onMenu={onMenu}
      details={() => <SceneDetails scene={scene} thumb={thumb} isOpen={isOpen} isCurrent={isCurrent} onOpen={onOpen} />}
    />
  );
};
