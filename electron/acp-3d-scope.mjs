const SLASH_COMMAND = /^\s*\/[a-z]+\b/i;
const QUOTED_CHECKS = /^\s*Quoted from Checks:/m;

export const OFFLINE_SCOPE =
  'I only make parts from a picture or a description. To teach a skill, fix a check or run a command, choose Claude, Codex or Gemini in Settings ▸ Agent.';

export function offlineRefusal(promptText) {
  const text = String(promptText ?? '');

  return SLASH_COMMAND.test(text) || QUOTED_CHECKS.test(text) ? OFFLINE_SCOPE : null;
}
