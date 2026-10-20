import { MAX_PROMPT_IMAGES } from './constants.mjs';

const EVIDENCE_INSTRUCTION =
  'The user attached evidence files. Study ALL of them with read_evidence before you plan: every image, every text file and every mesh summary.';

function legacyPromptBlocks(payload) {
  return [
    {
      type: 'text',
      text:
        `${payload.promptText || 'Convert reference image into 3D robotics model'}\n` +
        `__ACP_3D_PAYLOAD_START__${JSON.stringify(payload)}__ACP_3D_PAYLOAD_END__`,
    },
  ];
}

export function promptImageUrls(payload) {
  if (Array.isArray(payload.imageDataUrls) && payload.imageDataUrls.length) return payload.imageDataUrls;

  return payload.imageDataUrl ? [payload.imageDataUrl] : [];
}

function imageBlocks(payload, saveReferenceImage) {
  const blocks = [];
  const refNames = [];

  for (const url of promptImageUrls(payload).slice(0, MAX_PROMPT_IMAGES)) {
    const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(url || '');

    if (!m) continue;

    blocks.push({ type: 'image', mimeType: m[1], data: m[2] });

    const name = saveReferenceImage(m[1], m[2]);

    if (name) refNames.push(name);
  }

  return { blocks, refNames };
}

function openingLine(payload, referenceCount) {
  const typed = payload.promptText?.trim();

  if (typed) return typed;

  if (!referenceCount) return '';

  return `Build a part-based CAD model of what is in ${referenceCount > 1 ? 'these references' : 'this reference'}.`;
}

function promptLines({ payload, imageCount, refNames, folders }) {
  const lines = [openingLine(payload, imageCount + folders.length)];

  if (imageCount > 1)
    lines.push(`(${imageCount} reference images of the same object, from different angles or details.)`);

  if (refNames.length) {
    lines.push(
      `(Saved as ${refNames.join(', ')}, in the order shown. compare puts one beside a render of your model.)`,
    );
  }

  if (payload.targetHeightMm) lines.push(`Target overall height: about ${payload.targetHeightMm} mm.`);

  if (folders.length) lines.push('', EVIDENCE_INSTRUCTION, ...folders);

  return lines;
}

export function buildPromptBlocks(payload, { isAiAgent, saveReferenceImage, describeEvidenceFolder }) {
  if (!isAiAgent) return legacyPromptBlocks(payload);

  const { blocks, refNames } = imageBlocks(payload, saveReferenceImage);
  const folders = (Array.isArray(payload.evidenceFolders) ? payload.evidenceFolders : [])
    .map((f) => describeEvidenceFolder(f.id))
    .filter(Boolean);
  const lines = promptLines({ payload, imageCount: blocks.length, refNames, folders });

  blocks.push({
    type: 'text',
    text: lines
      .filter((l) => l !== undefined && l !== null)
      .join('\n')
      .trim(),
  });

  return blocks;
}
