import fs from 'node:fs';
import path from 'node:path';
import { CAD_SERVER, SAFE_TOOL_PATTERN } from './constants.mjs';

export function isSafeToolCall(call) {
  const label = `${call._meta?.claudeCode?.toolName ?? ''} ${call.title ?? ''} ${call.kind ?? ''}`;

  return (
    call.rawInput?.server === CAD_SERVER ||
    SAFE_TOOL_PATTERN.test(label) ||
    call.kind === 'fetch' ||
    call.kind === 'think'
  );
}

const definedEntries = (value) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v != null));

export function rememberToolCalls() {
  const calls = new Map();

  return {
    note(update) {
      if (!update?.toolCallId || !String(update.sessionUpdate).startsWith('tool_call')) return;

      calls.set(update.toolCallId, { ...calls.get(update.toolCallId), ...definedEntries(update) });
    },
    complete(toolCall) {
      return { ...calls.get(toolCall?.toolCallId), ...definedEntries(toolCall) };
    },
  };
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
  const toolCalls = rememberToolCalls();

  return {
    requestPermission: async (params) => {
      const { safe, title, outcome } = permissionOutcome({ ...params, toolCall: toolCalls.complete(params.toolCall) });

      if (!safe) emit({ type: 'agent-blocked', workspaceId: workspaceOf(params.sessionId), title });

      return { outcome };
    },
    sessionUpdate: async (params) => {
      toolCalls.note(params.update);
      emit({
        type: 'acp-session-update',
        sessionId: params.sessionId,
        workspaceId: workspaceOf(params.sessionId),
        update: params.update,
      });
    },
    writeTextFile: async (params) => {
      const targetPath = path.resolve(workspaceRoot, params.path);
      const modelsDir = path.join(libraryDir, 'models');

      if (path.dirname(targetPath) !== modelsDir || !/^[\w-]{1,128}\.json$/.test(path.basename(targetPath))) {
        throw new Error('Writes are limited to library/models/<id>.json');
      }

      fs.mkdirSync(modelsDir, { recursive: true });
      fs.writeFileSync(targetPath, params.content, 'utf-8');
      emit({ type: 'acp-file-written', path: targetPath, ...libraryState() });

      return {};
    },
  };
}
