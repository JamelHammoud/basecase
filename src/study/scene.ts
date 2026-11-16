import { applyCameraChoice, assertCameraSelections } from './cameraChoices';
import { supplyVolts } from '../cases/exploreDesigns';
import { COMPONENT_BY_ID, componentSize } from '../data/components';
import { isBattery, isFoot, sweepVariants, editMeasures, editTriangles, type Variant } from '../utils/designSweep';
import { findPowerSources, sceneTether, suggestedTether } from '../utils/powerSources';
import type { ScenePart } from '../types/robotics';
import type { StudyKnob, StudyScene, StudySceneOptions, StudySelection } from './types';

function selectedParts(scene: StudyScene, knob: Extract<StudyKnob, { kind: 'battery' | 'battery_offset' | 'foot' }>) {
  const matches = knob.kind === 'foot' ? isFoot : isBattery;
  const chosen = scene.parts.filter((p) => (knob.parts ? knob.parts.includes(p.id) : matches(p)));

  if (!chosen.length) throw new Error(`${knob.id}: Choose a part in the scene.`);

  return chosen;
}

function batterySwap(scene: StudyScene, knob: Extract<StudyKnob, { kind: 'battery' }>, index: number): StudyScene {
  const key = knob.values[index];
  const componentId = key.replace(/^component:/, '');
  const component = COMPONENT_BY_ID[componentId];
  const chosen = new Set(selectedParts(scene, knob).map((p) => p.id));

  if (!component?.battery && !component?.holder) throw new Error(`${key}: Choose a catalog battery.`);

  const swap = (part: ScenePart): ScenePart => {
    if (!chosen.has(part.id)) return part;

    return {
      ...part,
      kind: 'component',
      componentId,
      componentVariant: undefined,
      supplyId: undefined,
      dimensions: componentSize(componentId),
      massG: undefined,
      com: undefined,
    };
  };

  return { ...scene, parts: scene.parts.map(swap) };
}

function selectedVariant(
  parts: ScenePart[],
  knob: Extract<StudyKnob, { kind: 'battery_offset' | 'foot' }>,
  index: number,
): Variant {
  if (knob.kind === 'battery_offset') {
    const move = knob.values[index];

    return {
      label: '',
      parts: parts.map((part) => ({
        ...part,
        position: part.position.map((v, i) => v + move[i]) as ScenePart['position'],
      })),
      edits: new Map(parts.map((part) => [part.id, { move }])),
    };
  }

  const { length = 1, width = 1 } = knob.values[index];
  const scale: ScenePart['position'] = [width, 1, length];

  return {
    label: '',
    parts: parts.map((part) => ({
      ...part,
      dimensions: { ...part.dimensions, width: part.dimensions.width * width, depth: part.dimensions.depth * length },
    })),
    edits: new Map(parts.map((part) => [part.id, { scale }])),
  };
}

function suppliedScene(scene: StudyScene, volts: number): StudyScene {
  if (findPowerSources(scene).length) return scene;

  const amps = sceneTether(scene)?.amps ?? suggestedTether(scene.parts).amps;

  return { ...scene, project: { ...scene.project, tether: { volts, amps } } };
}

function applyKnob(scene: StudyScene, knob: StudyKnob, index: number): StudyScene {
  if (knob.kind === 'camera_pose' || knob.kind === 'camera_lens') return applyCameraChoice(scene, knob, index);

  if (knob.kind === 'dimension') return scene;

  if (knob.kind === 'battery') return batterySwap(scene, knob, index);

  if (knob.kind === 'voltage') return suppliedScene(scene, knob.values[index]);

  const parts = knob.kind === 'servo' ? scene.parts : selectedParts(scene, knob);
  const variants =
    knob.kind === 'servo'
      ? sweepVariants(parts, scene.project.joints ?? [], {
          kind: 'servo',
          joints: knob.joints,
          values: [knob.values[index]],
        })
      : [selectedVariant(parts, knob, index)];

  if (typeof variants === 'string') throw new Error(variants);

  const variant = variants[0];
  const originals = new Map(parts.map((part) => [part.id, part]));
  const replacements = new Map(
    variant.parts.map((p) => {
      const original = originals.get(p.id);
      const changed = p.componentId !== original?.componentId || p.componentVariant !== original?.componentVariant;

      return [p.id, changed ? { ...p, massG: undefined, com: undefined } : p];
    }),
  );
  const triangles = { ...scene.triangles };

  for (const part of parts) {
    const edit = variant.edits.get(part.id);
    const source = triangles[part.id];

    if (edit && source) triangles[part.id] = editTriangles(source, part, edit, scene.measures[part.id]);
  }

  return {
    ...scene,
    parts: scene.parts.map((p) => replacements.get(p.id) ?? p),
    measures: editMeasures(scene.measures, parts, variant.edits),
    triangles,
  };
}

function assertSelection(knobs: StudyKnob[], selection: StudySelection) {
  if (
    selection.length !== knobs.length ||
    selection.some((n, i) => !Number.isInteger(n) || n < 0 || n >= knobs[i].values.length)
  )
    throw new Error('Choose one value for each study setting.');
}

export async function studyScene(
  base: StudyScene,
  knobs: StudyKnob[],
  selection: StudySelection,
  options: StudySceneOptions = {},
): Promise<StudyScene> {
  assertSelection(knobs, selection);

  let scene = knobs.reduce(
    (current, knob, i) =>
      knob.kind === 'voltage' || knob.kind === 'dimension' || knob.kind === 'foot'
        ? current
        : applyKnob(current, knob, selection[i]),
    base,
  );
  const dimensions = new Map<string, Record<string, number>>();

  knobs.forEach((knob, i) => {
    if (knob.kind !== 'dimension') return;

    dimensions.set(knob.part, { ...dimensions.get(knob.part), [knob.name]: knob.values[selection[i]] });
  });

  if (dimensions.size && !options.dimension)
    throw new Error('Compile the named dimensions before grading this design.');

  for (const [part, values] of dimensions) scene = await options.dimension!({ scene, part, values });

  knobs.forEach((knob, i) => {
    if (knob.kind === 'foot') scene = applyKnob(scene, knob, selection[i]);
  });

  knobs.forEach((knob, i) => {
    if (knob.kind === 'voltage') scene = applyKnob(scene, knob, selection[i]);
  });

  if (
    knobs.some(
      (knob, i) => knob.kind === 'voltage' && supplyVolts(scene.parts, scene.project) !== knob.values[selection[i]],
    )
  )
    throw new Error('The battery or regulator fixes the servo voltage. Choose its supplied voltage.');

  assertCameraSelections(scene, knobs, selection);

  const original = new Map(base.parts.map((p) => [p.id, p]));
  const changed = scene.parts.filter((p) => p !== original.get(p.id)).map((p) => p.id);

  const needsGeometry = scene.parts.some(
    (p) =>
      p.componentId !== original.get(p.id)?.componentId ||
      p.supplyId !== original.get(p.id)?.supplyId ||
      p.cad !== original.get(p.id)?.cad,
  );

  if (needsGeometry && !options.geometry) throw new Error('Load the chosen catalog meshes before grading this design.');

  return changed.length && options.geometry ? options.geometry(scene, changed) : scene;
}
