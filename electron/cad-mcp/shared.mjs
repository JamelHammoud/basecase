import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { z } from 'zod';
import { TOOL_USE_HEADER, TOOL_USE_META } from '../backend/constants.mjs';
import { publicFetch } from '../publicFetch.mjs';

const BRIDGE_URL = process.env.CAD_BRIDGE_URL;

export const EVIDENCE_DIR = process.env.CAD_EVIDENCE_DIR ? path.resolve(process.env.CAD_EVIDENCE_DIR) : null;
export const REFERENCES_DIR = process.env.CAD_REFERENCES_DIR ? path.resolve(process.env.CAD_REFERENCES_DIR) : null;
export const NO_WEB = process.env.CAD_NO_WEB === '1';
export const VIEW = z
  .string()
  .regex(
    /^(iso|front|side|top|back|az:-?\d+(\.\d+)?,el:-?\d+(\.\d+)?)$/,
    'iso, front, side, top, back, or az:<deg>,el:<deg>',
  );
export const IMAGE_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const toolCall = new AsyncLocalStorage();

export const withToolCall = (extra, run) => toolCall.run({ toolUseId: extra?._meta?.[TOOL_USE_META] }, run);

function bridgeHeaders() {
  const toolUseId = toolCall.getStore()?.toolUseId;

  return { 'Content-Type': 'application/json', ...(toolUseId ? { [TOOL_USE_HEADER]: String(toolUseId) } : {}) };
}

export async function bridge(kind, payload, timeoutMs = 120000) {
  if (!BRIDGE_URL) throw new Error('CAD_BRIDGE_URL is not set; the app bridge is unavailable.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BRIDGE_URL}/agent/${kind}`, {
      method: 'POST',
      headers: bridgeHeaders(),
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });
    const body = await res.json();

    if (!res.ok || body.error) throw new Error(body.error || `Bridge error ${res.status}`);

    return body;
  } finally {
    clearTimeout(timer);
  }
}

export const text = (t) => ({
  content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 1) }],
});
export const fail = (err) => ({ isError: true, content: [{ type: 'text', text: String(err?.message ?? err) }] });

export function evidencePath(p) {
  if (!EVIDENCE_DIR) throw new Error('No evidence folder is set up.');

  const full = path.resolve(EVIDENCE_DIR, String(p).replace(/^\/+/, ''));

  if (!full.startsWith(EVIDENCE_DIR + path.sep)) throw new Error(`"${p}" is outside the evidence folder.`);

  return full;
}

export async function fetchWithTimeout(url, ms, init = {}) {
  return publicFetch(url, {
    ...init,
    signal: AbortSignal.timeout(ms),
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) Basecase/1.0', ...(init.headers ?? {}) },
  });
}

export async function clashText(ids) {
  try {
    const { items = [], coplanar = [] } = (await bridge('interference', { ids }, 60000)) ?? {};
    const lines = [
      ...items
        .slice(0, 8)
        .map(
          (it) =>
            `- ${it.a} ↔ ${it.b}: pass through each other, up to ${it.depthMm} mm deep. Cut a pocket or hole, or move one.`,
        ),
      ...coplanar
        .slice(0, 8)
        .map(
          (c) =>
            `- ${c.a} / ${c.b}: ${c.areaMm2} mm² of coincident same-facing surface. Cut a recess if one sits in the other, otherwise trim the overlap.`,
        ),
    ];

    return lines.length ? `\nFit problems to fix now:\n${lines.join('\n')}` : '';
  } catch {
    return '';
  }
}

export function withImages(res) {
  const content = [{ type: 'text', text: res?.text || 'ok' }];

  for (const shot of res?.images || []) {
    content.push({ type: 'text', text: shot.view });

    const m = /^data:(image\/\w+);base64,(.+)$/.exec(shot.dataUrl || '');

    if (m) content.push({ type: 'image', mimeType: m[1], data: m[2] });
  }

  return { content };
}

export const imageReply = (res, fallback) => {
  const content = [{ type: 'text', text: res?.text || fallback }];

  for (const shot of res?.images || []) {
    const m = /^data:(image\/\w+);base64,(.+)$/.exec(shot.dataUrl || '');

    if (!m) continue;

    content.push({ type: 'text', text: shot.view });
    content.push({ type: 'image', mimeType: m[1], data: m[2] });
  }

  return { content };
};
