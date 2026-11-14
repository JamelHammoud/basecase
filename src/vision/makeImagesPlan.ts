import type { VisionClass } from './frameSet';

interface PlanInput {
  views: { key: string; label: string }[];
  count: number;
  seed: number;
  cameras?: string[];
}

export const imageSetName = (name: string) => `${(name.trim() || 'Scene').slice(0, 193)} images`;

export const imageClassKey = (kind: Pick<VisionClass, 'kind' | 'name'>) => `${kind.kind}:${kind.name}`;

export function imageClassPlan(classes: VisionClass[], selected?: string[]): VisionClass[] {
  if (!selected?.length) return classes;

  const matches = (kind: VisionClass, name: string) =>
    kind.name === name || kind.kind === name || imageClassKey(kind) === name;
  const missing = selected.filter((name) => !classes.some((kind) => matches(kind, name)));

  if (missing.length) throw new Error(`Choose a class in this scene: ${missing.join(', ')}.`);

  return classes.filter((kind) => selected.some((name) => matches(kind, name)));
}

export function imagePlan(input: PlanInput): { camera: string; seed: number }[] {
  if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > 10000)
    throw new Error('Choose 1 to 10000 images.');

  if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff)
    throw new Error('Choose a seed from 0 to 4294967295.');

  const selected = input.cameras?.length ? input.cameras : input.views.map((view) => view.key);
  const matching = (name: string) =>
    input.views.find((view) => view.key === name || view.label.toLowerCase() === name.trim().toLowerCase());
  const missing = selected.filter((name) => !matching(name));

  if (missing.length) throw new Error(`Choose a camera in this scene: ${missing.join(', ')}.`);

  const cameras = [...new Set(selected.map((name) => matching(name)!.key))];

  if (!cameras.length) throw new Error('Add a camera view.');

  return Array.from({ length: input.count }, (_, index) => ({
    camera: cameras[index % cameras.length],
    seed: input.seed + index,
  }));
}
