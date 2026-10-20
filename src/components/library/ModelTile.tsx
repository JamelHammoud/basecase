import React from 'react';
import { usePartsThumbnail } from '../../three/partThumbnails';
import type { CustomModelDefinition } from '../../types/robotics';
import { ModelDetails, modelParts } from './details';
import { Tile } from './Tile';

const fmt = (v: number) => String(Math.round(v * 10) / 10);

const modelKey = (m: CustomModelDefinition) => `model:${m.id}:${m.createdAt}`;

export const ModelTile: React.FC<{
  model: CustomModelDefinition;
  renaming: boolean;
  onInsert: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  menuOpen: boolean;
  onMenu: (e: React.MouseEvent) => void;
}> = ({ model, renaming, onInsert, onStartRename, onRename, menuOpen, onMenu }) => {
  const thumb = usePartsThumbnail(modelKey(model), () => modelParts(model)) || model.sourceImageDataUrl;
  const d = model.defaultDimensions;

  return (
    <Tile
      name={model.name}
      meta={
        <>
          {fmt(d.width)} × {fmt(d.height)} × {fmt(d.depth)}
          <span className="text-white/30"> mm</span>
        </>
      }
      thumb={thumb}
      openLabel="Insert"
      renaming={renaming}
      onOpen={onInsert}
      onAdd={onInsert}
      dragModelId={model.id}
      onStartRename={onStartRename}
      onRename={onRename}
      menuOpen={menuOpen}
      onMenu={onMenu}
      details={() => <ModelDetails model={model} thumb={thumb} onInsert={onInsert} />}
    />
  );
};
