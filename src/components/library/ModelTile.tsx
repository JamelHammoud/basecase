import React from 'react';
import { usePartsThumbnail } from '../../three/partThumbnails';
import type { CustomModelDefinition } from '../../types/robotics';
import { SizeLine } from '../PartDetails';
import { ModelDetails, modelParts } from './details';
import { Tile } from './Tile';

const modelKey = (m: CustomModelDefinition) => `model:${m.id}:${m.createdAt}`;

export const ModelTile: React.FC<{
  model: CustomModelDefinition;
  renaming: boolean;
  onInsert: () => void;
  onRename: (name: string | null) => void;
  onMenu: (e: React.MouseEvent) => void;
}> = ({ model, renaming, onInsert, onRename, onMenu }) => {
  const rendered = usePartsThumbnail(modelKey(model), () => modelParts(model));
  const thumb = rendered || (model.sourceImageDataUrl ?? rendered);
  const d = model.defaultDimensions;

  return (
    <Tile
      name={model.name}
      meta={<SizeLine mm={[d.width, d.height, d.depth]} />}
      thumb={thumb}
      renaming={renaming}
      onInsert={onInsert}
      modelId={model.id}
      onRename={onRename}
      onMenu={onMenu}
      details={() => <ModelDetails model={model} thumb={thumb} />}
    />
  );
};
