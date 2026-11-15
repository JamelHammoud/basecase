import { clampDimension, rewriteDimensions, scadDimensions } from '../../electron/cad-kernel/dimensions.mjs';
import { withTunedPart } from '../agent/cadTune';
import { isCompiled } from '../workspace/cadCompile';
import { platformBridge } from '../utils/platformBridge';
import type { StudyDimension, StudyScene } from './types';

export async function compileStudyDimension({ scene, part: id, values }: StudyDimension): Promise<StudyScene> {
  const part = scene.parts.find((candidate) => candidate.id === id);

  if (!part?.cad || part.cad.language !== 'openscad') throw new Error('Choose an OpenSCAD part with named dimensions.');

  const code = rewriteDimensions(part.cad.code, values);
  const dimensions = scadDimensions(part.cad.code);

  if (
    dimensions.some(
      (dimension) =>
        dimension.name in values && clampDimension(dimension, values[dimension.name]) !== values[dimension.name],
    )
  )
    throw new Error('Choose dimension values inside the part’s range.');

  const rendered = await platformBridge.renderCad('openscad', code, part.cad.expect);

  if (!isCompiled(rendered)) throw new Error(rendered.error || 'The CAD kernel couldn’t compile this design.');

  return {
    ...scene,
    parts: withTunedPart(scene.parts, id, {
      ...rendered,
      language: 'openscad',
      code,
      expect: part.cad.expect,
    }),
  };
}
