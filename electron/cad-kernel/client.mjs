import { bridge } from '../cad-mcp/shared.mjs';

const RENDER_TIMEOUT_MS = 90000;
const AUDIT_TIMEOUT_MS = 60000;
const BRIDGE_SLACK_MS = 45000;

async function askKernel(kind, payload, timeoutMs) {
  try {
    return await bridge(kind, payload, timeoutMs + BRIDGE_SLACK_MS);
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export function renderPart(language, code, options = {}) {
  const { timeoutMs = RENDER_TIMEOUT_MS, expect } = options;

  return askKernel('kernel_render', { language, code, expect, timeoutMs }, timeoutMs);
}

export function auditPart(mesh) {
  return askKernel('kernel_audit', { mesh }, AUDIT_TIMEOUT_MS);
}

export function warmUp() {
  bridge('kernel_warm', {}, 10000).catch(() => {});
}
