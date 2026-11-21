import { constants } from 'node:buffer';
import { MAX_SOURCE_BYTES } from './cadImport/convertPolicy.mjs';
import { MB } from './fileSize.mjs';

const ENVELOPE = 64 * 1024;
const base64Body = (bytes) => 4 * Math.ceil(bytes / 3) + ENVELOPE;
const LARGE_JSON = 256 * MB;

export const AGENT_BODY_BYTES = 80_000_000;

const ROUTE_LIMITS = new Map([
  ['/upload-image', 2 * MB],
  ['/save-scene-preview', 2 * MB],
  ['/save-evidence-file', 16 * MB],
  ['/save-model', 36 * MB],
  ['/save-scene', LARGE_JSON],
  ['/cad-open', base64Body(MAX_SOURCE_BYTES)],
  ['/cad-export-step', LARGE_JSON],
  ['/cad-tune', 16 * MB],
  ['/cad-render', 16 * MB],
  ['/sourced-save', 16 * MB],
  ['/chat-save', 16 * MB],
  ['/acp-prompt', 16 * MB],
  ['/acp-steer', 16 * MB],
  ['/agent-call', AGENT_BODY_BYTES],
  ['/agent-respond', LARGE_JSON],
  ['/train-start', LARGE_JSON],
  ['/train-kit', LARGE_JSON],
  ['/skill-save', LARGE_JSON],
  ['/print-open', base64Body(MAX_SOURCE_BYTES)],
  ['/print-slice', base64Body(MAX_SOURCE_BYTES)],
  ['/print-quote', base64Body(MAX_SOURCE_BYTES)],
  ['/hub-publish', LARGE_JSON],
  ['/datasets-save', 16 * MB + ENVELOPE],
  ['/datasets-content-save', base64Body(1024 * MB)],
  ['/datasets-images-save-frame', 180 * MB + ENVELOPE],
  ['/datasets-images-save-manifest', 16 * MB + ENVELOPE],
  ['/tries-save', base64Body(1280 * MB) + MB],
  ['/tries-keep-strip', base64Body(2 * MB)],
  ['/tries-keep-index', base64Body(512 * MB)],
]);

export function bridgeBodyLimit(url) {
  if (url.startsWith('/vision-training-') || url.startsWith('/electrical-')) return 24 * MB;

  const route = url.split('?')[0];

  return Math.min(ROUTE_LIMITS.get(route) ?? MB, constants.MAX_STRING_LENGTH);
}
