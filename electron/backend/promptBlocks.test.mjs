import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeEvidenceFolder, saveEvidenceFile } from './evidence.mjs';
import { buildPromptBlocks } from './promptBlocks.mjs';
import { ReferenceImages } from './referenceImages.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-'));
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const png = 'data:image/png;base64,iVBORw0KGgo=';

function promptDeps() {
  const references = new ReferenceImages(dir);

  fs.writeFileSync(path.join(dir, 'ref-4.png'), '');

  return {
    isClaude: true,
    saveReferenceImage: (mime, base64) => references.save(mime, base64),
    describeEvidenceFolder: (id) => describeEvidenceFolder(dir, id),
  };
}

describe('buildPromptBlocks', () => {
  it('sends images, numbers saved references and lists evidence folders', () => {
    saveEvidenceFile(dir, { folderId: 'f1', folderName: 'Robot', relPath: 'views/front.png', dataUrl: png });
    saveEvidenceFile(dir, { folderId: 'f1', relPath: 'leg.mesh.txt', text: 'bbox' });
    saveEvidenceFile(dir, { folderId: 'f1', relPath: '../notes.md', text: 'n' });

    const blocks = buildPromptBlocks(
      { imageDataUrls: [png, 'not-an-image', png], targetHeightMm: 400, evidenceFolders: [{ id: 'f1' }] },
      promptDeps(),
    );

    expect(blocks.map((b) => b.type)).toEqual(['image', 'image', 'text']);
    expect(fs.existsSync(path.join(dir, 'ref-5.png'))).toBe(true);
    expect(blocks[2].text.split('\n')).toEqual([
      'Build a part-based CAD model of what is in these references.',
      '(2 reference images of the same object, from different angles or details.)',
      '(Saved as ref-5, ref-6, in the order shown. compare puts one beside a render of your model.)',
      'Target overall height: about 400 mm.',
      '',
      'The user attached evidence files. Study ALL of them with read_evidence before you plan: every image, every text file and every mesh summary.',
      'Evidence folder "Robot" (1 mesh summary, 1 text file, 1 image):',
      '- f1/leg.mesh.txt (mesh summary, 1 KB)',
      '- f1/notes.md (text, 1 KB)',
      '- f1/views/front.png (image, 1 KB)',
    ]);
  });

  it('keeps typed text and wraps the payload for the offline agent', () => {
    const deps = promptDeps();

    expect(buildPromptBlocks({ promptText: '  Longer legs ', imageDataUrl: png }, deps)[1].text).toBe(
      'Longer legs\n(Saved as ref-5, in the order shown. compare puts one beside a render of your model.)',
    );
    expect(buildPromptBlocks({ promptText: 'Hi' }, { ...deps, isClaude: false })[0].text).toBe(
      'Hi\n__ACP_3D_PAYLOAD_START__{"promptText":"Hi"}__ACP_3D_PAYLOAD_END__',
    );
  });
});
