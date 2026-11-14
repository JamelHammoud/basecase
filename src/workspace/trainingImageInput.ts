export const MAX_TRAINING_IMAGES = 1000;

export interface TrainingImageInput {
  count: number;
  seed: number;
  cameras?: string[];
  classes?: string[];
}

function names(raw: unknown, label: string): string[] | undefined {
  if (raw === undefined) return undefined;

  if (!Array.isArray(raw) || !raw.length || raw.length > 256) throw new Error(`Choose 1 to 256 ${label}.`);

  if (raw.some((value) => typeof value !== 'string' || !value.trim() || value.length > 120))
    throw new Error(`Choose ${label} by name.`);

  return [...new Set((raw as string[]).map((value) => value.trim()))];
}

export function trainingImageInput(payload: Record<string, unknown>): TrainingImageInput {
  const count = payload.count === undefined ? 20 : payload.count;
  const seed = payload.seed === undefined ? 1 : payload.seed;

  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_TRAINING_IMAGES)
    throw new Error(`Choose 1 to ${MAX_TRAINING_IMAGES} images.`);

  if (typeof seed !== 'number' || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('Choose a whole seed number from 0 to 4294967295.');

  const cameras = names(payload.cameras, 'cameras');
  const classes = names(payload.classes, 'classes');

  return { count, seed, ...(cameras ? { cameras } : {}), ...(classes ? { classes } : {}) };
}
