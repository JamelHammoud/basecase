import type { SnapPlacement } from '../agent/snap';
import { ARTICULATED_PARTS } from '../data/articulatedParts';
import { catalogItemFromKey } from '../data/catalog';
import { carriedDrag, MODEL_DRAG_TYPE, PART_DRAG_TYPE } from '../data/dnd';
import type { CustomModelDefinition, ScenePart } from '../types/robotics';
import { modelToParts } from '../utils/libraryParts';
import { catalogPart } from './partFactories';
import type { Vec3 } from './types';

export const DROP_PREVIEW_ID = 'drop-preview';

export function modelBase(model: CustomModelDefinition, at?: Vec3): Vec3 {
  return at
    ? [at[0], Math.round((at[1] + model.defaultDimensions.height / 2) * 10) / 10, at[2]]
    : [0, Math.round(model.defaultDimensions.height / 2), 0];
}

interface DropInput {
  types: readonly string[];
  parts: ScenePart[];
  models: CustomModelDefinition[];
  at: Vec3 | undefined;
}

function droppedCatalogPart(parts: ScenePart[], at: Vec3 | undefined): ScenePart | null {
  const item = catalogItemFromKey(carriedDrag(PART_DRAG_TYPE));

  if (!item || (item.componentId && ARTICULATED_PARTS[item.componentId])) return null;

  return catalogPart(item, DROP_PREVIEW_ID, parts, at);
}

function droppedModelPart(models: CustomModelDefinition[], at: Vec3 | undefined): ScenePart | null {
  const model = models.find((m) => m.id === carriedDrag(MODEL_DRAG_TYPE));
  const inserted = model ? modelToParts(model, modelBase(model, at), () => DROP_PREVIEW_ID).parts : [];

  return inserted.length === 1 ? inserted[0] : null;
}

export function droppedPart({ types, parts, models, at }: DropInput): ScenePart | null {
  if (!at) return null;

  if (types.includes(PART_DRAG_TYPE)) return droppedCatalogPart(parts, at);

  return types.includes(MODEL_DRAG_TYPE) ? droppedModelPart(models, at) : null;
}

export const withPlacement = (part: ScenePart, place: SnapPlacement | undefined): ScenePart =>
  place ? { ...part, ...place, mates: place.mates?.length ? place.mates : undefined } : part;
