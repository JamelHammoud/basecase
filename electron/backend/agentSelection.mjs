import fs from 'node:fs';
import path from 'node:path';

const fileOf = (libraryDir) => path.join(libraryDir, 'agent.json');

export function loadAgentCommand(libraryDir) {
  try {
    const saved = JSON.parse(fs.readFileSync(fileOf(libraryDir), 'utf-8'));

    return typeof saved?.command === 'string' && saved.command.trim() ? saved.command.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function saveAgentCommand(libraryDir, command) {
  try {
    fs.mkdirSync(libraryDir, { recursive: true });
    fs.writeFileSync(fileOf(libraryDir), JSON.stringify({ command }), 'utf-8');
  } catch {}
}

const AUTH_REQUIRED = -32000;

export const isAuthError = (err) =>
  err?.code === AUTH_REQUIRED || /auth|log ?in|sign ?in|credential/i.test(String(err?.message ?? err?.data ?? ''));

export const acceptsApiKey = (authMethods) => (authMethods ?? []).some((m) => m._meta?.['api-key']);

export function signInMethods(authMethods) {
  return (authMethods ?? [])
    .filter((m) => !m._meta?.['api-key'] && !m._meta?.gateway)
    .map((m) => ({ id: m.id, name: m.name }));
}
