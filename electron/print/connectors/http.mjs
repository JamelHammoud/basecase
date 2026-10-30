import fs from 'node:fs';
import path from 'node:path';
import { unreachableMessage } from './shared.mjs';

const REQUEST_TIMEOUT_MS = 8000;

export const UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

export function baseUrl(host) {
  const trimmed = String(host ?? '')
    .trim()
    .replace(/\/+$/, '');

  if (!trimmed) throw new Error('Add the printer’s address.');

  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function plainText(text) {
  const trimmed = String(text ?? '').trim();

  return trimmed && trimmed.length < 200 && !trimmed.startsWith('<') ? trimmed : undefined;
}

export function errorDetail(data, text) {
  const error = data?.error;

  if (typeof error === 'string') return error;

  return error?.message ?? data?.message ?? data?.title ?? (data === undefined ? plainText(text) : undefined);
}

function sentence(text) {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function refusalMessage(status, detail) {
  if (status === 409 && detail) return `The printer is busy: ${sentence(detail)}`;

  if (status === 409) return 'The printer is busy. Wait for it to finish, then try again.';

  if (status === 413 || status === 507)
    return 'The printer is out of storage. Delete some files on it, then try again.';

  if (detail) return `The printer refused the request: ${sentence(detail)}`;

  return 'The printer refused the request. Check it’s ready, then try again.';
}

async function fetchOrExplain(url, { host, init, timeoutMs }) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Error(unreachableMessage(host));
  }
}

export function httpClient({ host, headers = {}, authMessage }) {
  async function call(route, { method = 'GET', body, headers: extra = {}, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const url = `${baseUrl(host)}${route}`;
    const init = { method, body, headers: { ...headers, ...extra } };
    const response = await fetchOrExplain(url, { host, init, timeoutMs });

    if (response.status === 401 || response.status === 403) throw new Error(authMessage);

    const text = await response.text();
    const data = text ? parseJson(text) : undefined;

    if (!response.ok) throw new Error(refusalMessage(response.status, errorDetail(data, text)));

    return data ?? text;
  }

  return { call };
}

export async function fileBlob(file) {
  try {
    return await fs.openAsBlob(file, { type: 'application/octet-stream' });
  } catch {
    throw new Error(`Couldn’t read ${path.basename(String(file))}. Slice the plate again.`);
  }
}

export async function uploadForm({ file, name, fields = {} }) {
  const form = new FormData();

  form.append('file', await fileBlob(file), name);

  for (const [key, value] of Object.entries(fields)) form.append(key, value);

  return form;
}
