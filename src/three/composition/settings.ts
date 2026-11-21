import type { ViewShot } from '../viewport/types';

export interface CompositionSettings {
  view: ViewShot;
  width: number;
  height: number;
  lighting: number;
  exposure: number;
  rotation: number;
  background: string;
  transparent: boolean;
}

export const MAX_RENDER_SIDE = 4096;
export const MAX_RENDER_PIXELS = 8_388_608;

export const defaultComposition = (): CompositionSettings => ({
  view: { position: [170, 135, 180], target: [0, 18, 0], hfovDeg: 60 },
  width: 1600,
  height: 1200,
  lighting: 1,
  exposure: 1.15,
  rotation: 0,
  background: '#2c2c2c',
  transparent: false,
});

const between = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const vector = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((n) => between(n, -1e9, 1e9));

function validView(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;

  const view = value as ViewShot;

  return (
    vector(view.position) &&
    vector(view.target) &&
    view.position.some((n, index) => n !== view.target[index]) &&
    between(view.hfovDeg, 1, 179)
  );
}

export function validComposition(value: unknown): value is CompositionSettings {
  if (!value || typeof value !== 'object') return false;

  const settings = value as CompositionSettings;

  return (
    validView(settings.view) &&
    Number.isInteger(settings.width) &&
    Number.isInteger(settings.height) &&
    between(settings.width, 64, MAX_RENDER_SIDE) &&
    between(settings.height, 64, MAX_RENDER_SIDE) &&
    settings.width * settings.height <= MAX_RENDER_PIXELS &&
    between(settings.lighting, 0, 4) &&
    between(settings.exposure, 0.1, 4) &&
    between(settings.rotation, -360, 360) &&
    typeof settings.background === 'string' &&
    /^#[a-f\d]{6}$/i.test(settings.background) &&
    typeof settings.transparent === 'boolean'
  );
}

export const readComposition = (value: unknown): CompositionSettings =>
  validComposition(value) ? value : defaultComposition();
