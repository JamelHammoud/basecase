import fs from 'node:fs';

const SCENES_DEBOUNCE_MS = 150;

export function watchLibrary({ modelsDir, scenesDir, onModelsChanged, onScenesChanged }) {
  let scenesChangedTimer;

  try {
    fs.watch(modelsDir, () => onModelsChanged());
    fs.watch(scenesDir, () => {
      clearTimeout(scenesChangedTimer);
      scenesChangedTimer = setTimeout(() => onScenesChanged(), SCENES_DEBOUNCE_MS);
    });
  } catch {}
}
