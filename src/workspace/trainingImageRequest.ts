export interface TrainingImageInput {
  case?: string;
  count: number;
  cameras?: string[];
  classes?: string[];
  seed?: number;
}

const MAX_COUNT = 10_000;
const MAX_NAMES = 10000;
const MAX_SEED = 0xffffffff;

function names(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;

  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_NAMES) throw new Error('Choose cameras and classes.');

  if (raw.some((name) => typeof name !== 'string' || !name.trim() || name.length > 4096))
    throw new Error('Choose cameras and classes by name.');

  return [...new Set(raw as string[])];
}

function checkCase(wanted: unknown) {
  if (wanted !== undefined && (typeof wanted !== 'string' || !wanted.trim() || wanted.length > 120))
    throw new Error('Choose a Case by name.');
}

export function trainingImageInput(payload: Record<string, unknown>): TrainingImageInput {
  const { count, seed } = payload;

  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_COUNT)
    throw new Error(`Choose 1 to ${MAX_COUNT} images.`);

  if (seed !== undefined && (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > MAX_SEED))
    throw new Error('Choose a seed from 0 to 4294967295.');

  checkCase(payload.case);

  const cameras = names(payload.cameras);
  const classes = names(payload.classes);

  return {
    count,
    ...(typeof payload.case === 'string' ? { case: payload.case } : {}),
    ...(seed !== undefined ? { seed: seed as number } : {}),
    ...(cameras ? { cameras } : {}),
    ...(classes ? { classes } : {}),
  };
}
