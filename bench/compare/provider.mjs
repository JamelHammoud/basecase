import fs from 'node:fs';
import path from 'node:path';
import { AGENT_COMMANDS } from '../../electron/backend/agentProfiles.mjs';
import { claudeSubscriptionEnv } from '../../tools/loop/lib/claude.mjs';
import { codexHome } from '../../tools/loop/lib/codexHome.mjs';

export const providerOf = (model) => (/^(gpt-|o\d)/i.test(model) ? 'codex' : 'claude');

export function comparisonProvider(args, models) {
  const at = args.indexOf('--provider');
  const provider = at >= 0 ? args[at + 1] : providerOf(models[0]);

  if (!['codex', 'claude'].includes(provider)) throw new Error(`Unsupported comparison provider: ${provider}`);

  if (models.some((model) => providerOf(model) !== provider))
    throw new Error('Both comparison models must use the selected provider.');

  return provider;
}

export function prepareProvider(app, provider, subscription) {
  if (!provider) return {};

  fs.mkdirSync(path.join(app, 'library'), { recursive: true });
  fs.writeFileSync(path.join(app, 'library', 'agent.json'), JSON.stringify({ command: AGENT_COMMANDS[provider] }));

  if (!subscription) return {};

  if (provider === 'codex') return codexHome();

  return claudeSubscriptionEnv();
}

export async function runSerialGroups(groups, run) {
  for (const group of groups) await run(group);
}
