import fs from 'node:fs';
import path from 'node:path';
import { newestFirst, readJsonRecords } from './jsonRecords.mjs';

export function saveUploadedImage(uploadsDir, { name, dataUrl, width, height }) {
  const id = `img-${Date.now().toString(36)}`;
  const safeName = (name || 'reference.png').replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(uploadsDir, `${id}-${safeName}`);
  const base64Match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);

  if (base64Match) {
    fs.writeFileSync(filePath, Buffer.from(base64Match[2], 'base64'));
  }

  const record = {
    id,
    name: name || 'Reference Image',
    filePath,
    dataUrl,
    uploadedAt: new Date().toISOString(),
    width,
    height,
  };

  fs.writeFileSync(path.join(uploadsDir, `${id}.meta.json`), JSON.stringify(record, null, 2), 'utf-8');

  return record;
}

export function listUploadedImages(uploadsDir) {
  return readJsonRecords(uploadsDir, '.meta.json').sort(newestFirst('uploadedAt'));
}
