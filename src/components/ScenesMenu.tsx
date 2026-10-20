import React, { useRef, useState } from 'react';
import { ContextMenu, IconButton, PopoverMenu, type ContextMenuEntry, MenuIcon } from '../design-system';
import type { SavedSceneSummary } from '../types/robotics';
import { useSavedScenes } from '../utils/sceneStore';
import { DeleteSceneDialog } from './scenes/DeleteSceneDialog';
import { SceneList } from './scenes/SceneList';
import { sceneMenu } from './scenes/sceneMenu';

export interface ScenesMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSceneId: string;
  onOpenScene: (scene: SavedSceneSummary) => void;
  onRenameScene: (scene: SavedSceneSummary, name: string) => void;
  onDuplicateScene: (scene: SavedSceneSummary) => void;
  onDeleteScene: (scene: SavedSceneSummary) => void;
}

type Menu = { x: number; y: number; entries: ContextMenuEntry[] };

export const ScenesMenu: React.FC<ScenesMenuProps> = (props) => {
  const { open, onOpenChange, currentSceneId } = props;
  const scenes = useSavedScenes();
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [confirming, setConfirming] = useState<SavedSceneSummary | null>(null);

  const close = () => {
    onOpenChange(false);
    setQuery('');
    setRenaming(null);
  };

  const openScene = (scene: SavedSceneSummary) => {
    close();
    props.onOpenScene(scene);
  };

  const dismiss = (reason: 'outside' | 'escape') => {
    const escape = reason === 'escape';

    const layered = !!(confirming || menu);

    if (layered && escape) setConfirming(null);

    if (layered) return;

    if (escape && renaming) setRenaming(null);
    else if (escape && query) setQuery('');
    else close();
  };

  const showMenu = (scene: SavedSceneSummary, e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      entries: sceneMenu({
        isCurrent: scene.id === currentSceneId,
        onOpen: () => openScene(scene),
        onRename: () => setRenaming(scene.id),
        onDuplicate: () => props.onDuplicateScene(scene),
        onDelete: () => setConfirming(scene),
      }),
    });
  };

  return (
    <div ref={triggerRef} className="relative">
      <IconButton
        icon={<MenuIcon className="w-4 h-4" />}
        title="Scenes"
        shortcut="⌘O"
        isToggled={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : onOpenChange(true))}
      />
      <PopoverMenu
        isOpen={open}
        onClose={dismiss}
        position="bottom"
        align="start"
        ignoreRef={triggerRef}
        className="!p-0"
      >
        <SceneList
          scenes={scenes}
          query={query}
          onQuery={setQuery}
          currentSceneId={currentSceneId}
          renaming={renaming}
          onOpen={openScene}
          onRename={(scene, name) => {
            setRenaming(null);

            if (name && name !== scene.name) props.onRenameScene(scene, name);
          }}
          onMenu={showMenu}
        />
      </PopoverMenu>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.entries} onClose={() => setMenu(null)} />}
      <DeleteSceneDialog
        scene={confirming}
        onCancel={() => setConfirming(null)}
        onDelete={(scene) => {
          setConfirming(null);
          props.onDeleteScene(scene);
        }}
      />
    </div>
  );
};
