import React, { useMemo } from 'react';
import type { CustomModelDefinition, ScenePart } from '../../types/robotics';
import { modelNote, modelToParts } from '../../utils/libraryParts';
import { agoPhrase } from '../../utils/timeAgo';
import { Header, HeroImage, SizeLine, Stat } from '../PartDetails';

export function modelParts(m: CustomModelDefinition): ScenePart[] {
  let n = 0;

  return modelToParts(m, [0, 0, 0], () => `preview-${n++}`).parts;
}

const fromCatalog = (parts: ScenePart[]) => parts.filter((p) => p.kind === 'component' || p.hardware).length;

const MODEL_SOURCE: Record<CustomModelDefinition['sourceType'], string> = {
  'scene-selection': 'Saved from a scene',
  'agent-acp': 'Made by the agent',
  'image-to-3d-acp': 'From an image',
  'sculpt-draw': 'Sketch or sculpt',
};

export const ModelDetails: React.FC<{ model: CustomModelDefinition; thumb: string | undefined }> = ({ model, thumb }) => {
  const parts = useMemo(() => modelParts(model), [model]);
  const d = model.defaultDimensions;

  return (
    <div>
      <HeroImage src={thumb} className="h-[168px]" />
      <Header
        title={model.name}
        subtitle={[MODEL_SOURCE[model.sourceType] ?? 'Model', model.createdAt ? agoPhrase(model.createdAt) : '']}
        description={modelNote(model) || undefined}
      />
      <div className="px-4 mt-3 pb-4 grid grid-cols-2 gap-1.5">
        <Stat label="Size" wide>
          <SizeLine mm={[d.width, d.height, d.depth]} />
        </Stat>
        <Stat label="Parts">{parts.length}</Stat>
        {fromCatalog(parts) > 0 && <Stat label="From catalog">{fromCatalog(parts)}</Stat>}
      </div>
    </div>
  );
};
