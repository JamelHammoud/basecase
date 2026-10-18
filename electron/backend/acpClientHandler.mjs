import fs from 'node:fs';
import path from 'node:path';
import { SAFE_TOOL_PATTERN } from './constants.mjs';

export function isSafeToolCall(call) {
  const label = `${call._meta?.claudeCode?.toolName ?? ''} ${call.title ?? ''} ${call.kind ?? ''}`;

  return SAFE_TOOL_PATTERN.test(label) || call.kind === 'fetch' || call.kind === 'think';
}

function pickOption(options, prefix) {
  return options.find((o) => o.kind === `${prefix}_once`) ?? options.find((o) => String(o.kind).startsWith(prefix));
}

export function permissionOutcome(params) {
  const call = params.toolCall ?? {};
  const safe = isSafeToolCall(call);
  const choice = pickOption(params.options ?? [], safe ? 'allow' : 'reject');
  const outcome = choice ? { outcome: 'selected', optionId: choice.optionId } : { outcome: 'cancelled' };

  return { safe, title: call.title ?? 'Tool', outcome };
}

export function createClientHandler({ workspaceRoot, libraryDir, emit, workspaceOf, libraryState }) {
  return {
    requestPermission: async (params) => {
      const { safe, title, outcome } = permissionOutcome(params);

      if (!safe) emit({ type: 'agent-blocked', workspaceId: workspaceOf(params.sessionId), title });

      return { outcome };
    },
    sessionUpdate: async (params) => {
      emit({
        type: 'acp-session-update',
        sessionId: params.sessionId,
        workspaceId: workspaceOf(params.sessionId),
        update: params.update,
      });
    },
    readTextFile: async (params) => {
      const targetPath = path.resolve(workspaceRoot, params.path);

      if (!targetPath.startsWith(workspaceRoot)) throw new Error('Outside workspace');

      return { content: fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf-8') : '' };
    },
    writeTextFile: async (params) => {
      const targetPath = path.resolve(workspaceRoot, params.path);

      if (!targetPath.startsWith(libraryDir)) throw new Error('Writes are limited to library/');

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, params.content, 'utf-8');
      emit({ type: 'acp-file-written', path: targetPath, ...libraryState() });

      return {};
    },
  };
}
