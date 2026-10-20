import fs from 'node:fs';
import path from 'node:path';

export function writeAiReference(aiRefDir, scenePayload) {
  if (scenePayload.spec) {
    fs.writeFileSync(path.join(aiRefDir, 'design-spec.json'), JSON.stringify(scenePayload.spec, null, 2), 'utf-8');
  }

  if (scenePayload.markdown) {
    fs.writeFileSync(path.join(aiRefDir, 'DESIGN_BRIEF.md'), scenePayload.markdown, 'utf-8');
  }

  const webp = scenePayload.previewDataUrl?.match(/^data:image\/webp;base64,(.+)$/);

  if (webp) fs.writeFileSync(path.join(aiRefDir, 'preview.webp'), Buffer.from(webp[1], 'base64'));
}
