import React, { useMemo } from 'react';
import type { CustomModelDefinition, SavedSceneSummary, ScenePart } from '../../types/robotics';
import { modelToParts } from '../../utils/libraryParts';
import { timeAgo } from '../../utils/timeAgo';
import { Button } from '../../design-system';
import { Header, SizeLine, Stat } from '../PartDetails';

export function savedWhen(iso: string | undefined): string {
  if (!iso) return '';

  const t = timeAgo(iso);

  if (t === 'now') return 'Saved just now';

  return /^\d+[mhd]$/.test(t) ? `Saved ${t} ago` : `Saved ${t}`;
}

export function modelParts(m: CustomModelDefinition): ScenePart[] {
  let n = 0;

  return modelToParts(m, [0, 0, 0], () => `preview-${n++}`).parts;
}

export const DetailsHero: React.FC<{ thumb: string | undefined }> = ({ thumb }) => (
  <div className="relative h-[168px] bg-[radial-gradient(ellipse_at_50%_45%,rgba(255,255,255,0.13),rgba(255,255,255,0.02)_60%,transparent_100%)]">
    {thumb ? (
      <img
        src={thumb}
        alt=""
        draggable={false}
        className="absolute inset-0 w-full h-full object-contain p-3 animate-fade-in drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]"
      />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-white/30">No preview</div>
    )}
  </div>
);

const fromCatalog = (parts: ScenePart[]) => parts.filter((p) => p.kind === 'component' || p.hardware).length;

export const SceneDetails: React.FC<{
  scene: SavedSceneSummary;
  thumb: string | undefined;
  isOpen: boolean;
  isCurrent: boolean;
  onOpen: () => void;
}> = ({ scene, thumb, isOpen, isCurrent, onOpen }) => {
  const size = scene.sizeMm;
  const catalog = scene.catalogCount ?? 0;
  const comments = scene.commentCount ?? 0;

  return (
    <div>
      <DetailsHero thumb={thumb} />
      <Header title={scene.name} subtitle={savedWhen(scene.updatedAt)} description={scene.globalGoal || undefined} />
      <div className="px-4 mt-3 grid grid-cols-2 gap-1.5">
        {size && (
          <Stat label="Size" wide>
            <SizeLine w={size[0]} h={size[1]} d={size[2]} />
          </Stat>
        )}
        <Stat label="Parts">{scene.partCount}</Stat>
        {catalog > 0 && <Stat label="From catalog">{catalog}</Stat>}
        {comments > 0 && <Stat label="Comments">{comments}</Stat>}
      </div>
      {isCurrent ? (
        <div className="h-4" />
      ) : (
        <div className="mt-3 border-t border-white/[0.07] p-3">
          <Button variant="primary" size="sm" fullWidth onClick={onOpen}>
            {isOpen ? 'Show Tab' : 'Open'}
          </Button>
        </div>
      )}
    </div>
  );
};

const MODEL_SOURCE: Record<CustomModelDefinition['sourceType'], string> = {
  'scene-selection': 'Saved from a scene',
  'agent-acp': 'Made by the agent',
  'image-to-3d-acp': 'From an image',
  'sculpt-draw': 'Sketch or sculpt',
};

export const ModelDetails: React.FC<{ model: CustomModelDefinition; thumb: string | undefined; onInsert: () => void }> = ({
  model,
  thumb,
  onInsert,
}) => {
  const parts = useMemo(() => modelParts(model), [model]);
  const d = model.defaultDimensions;

  return (
    <div>
      <DetailsHero thumb={thumb} />
      <Header
        title={model.name}
        subtitle={`${MODEL_SOURCE[model.sourceType] ?? 'Model'} · ${savedWhen(model.createdAt).replace(/^Saved /, '')}`}
        description={
          model.description && !/^Saved from \d+ parts?\.?$/.test(model.description) ? model.description : undefined
        }
      />
      <div className="px-4 mt-3 grid grid-cols-2 gap-1.5">
        <Stat label="Size" wide>
          <SizeLine w={d.width} h={d.height} d={d.depth} />
        </Stat>
        <Stat label="Parts">{parts.length}</Stat>
        {fromCatalog(parts) > 0 && <Stat label="From catalog">{fromCatalog(parts)}</Stat>}
      </div>
      <div className="mt-3 border-t border-white/[0.07] p-3">
        <Button variant="primary" size="sm" fullWidth onClick={onInsert}>
          Insert
        </Button>
      </div>
    </div>
  );
};
