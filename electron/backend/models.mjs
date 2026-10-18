import fs from 'node:fs';
import path from 'node:path';
import { newestFirst, readJsonRecords } from './jsonRecords.mjs';

export function listModels(modelsDir) {
  return readJsonRecords(modelsDir, '.json').sort(newestFirst('createdAt'));
}

export function saveModel(modelsDir, modelDef) {
  const id = modelDef.id || `model-${Date.now().toString(36)}`;
  const record = {
    ...modelDef,
    id,
    createdAt: modelDef.createdAt || new Date().toISOString(),
  };

  fs.writeFileSync(path.join(modelsDir, `${id}.json`), JSON.stringify(record), 'utf-8');

  return record;
}

export function deleteModel(modelsDir, modelId) {
  const filePath = path.join(modelsDir, `${modelId}.json`);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
