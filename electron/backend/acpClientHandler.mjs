import fs from 'node:fs';
import path from 'node:path';
import { CAD_SERVER, SAFE_TOOLS } from './constants.mjs';

export function isSafeToolCall(call) {
  const toolName = call._meta?.claudeCode?.toolName;
  const name = toolName ?? call.name;

  if (toolName != null && call.name != null && toolName !== call.name) return false;

  return typeof name === 'string' && (SAFE_TOOLS.has(name) || name.startsWith(`mcp__${CAD_SERVER}__`));
}

const definedEntries = (value) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v != null));

function mergeToolCall(previous, current) {
  const fields = definedEntries(current);
  const hasIdentity = fields.name != null || fields._meta?.claudeCode?.toolName != null;
  const clearedIdentity = hasIdentity ? { name: undefined, _meta: undefined } : {};

  return { ...previous, ...clearedIdentity, ...fields };
}

export function rememberToolCalls() {
  const calls = new Map();
  const keyOf = (call, sessionId) => JSON.stringify([sessionId, call?.toolCallId]);

  return {
    note(update, sessionId) {
      if (!update?.toolCallId || !String(update.sessionUpdate).startsWith('tool_call')) return;

      const key = keyOf(update, sessionId);
      const previous = update.sessionUpdate === 'tool_call' ? undefined : calls.get(key);

      calls.set(key, mergeToolCall(previous, update));
    },
    complete(toolCall, sessionId) {
      const key = keyOf(toolCall, sessionId);
      const completed = mergeToolCall(calls.get(key), toolCall);

      if (toolCall?.toolCallId) calls.set(key, completed);

      return completed;
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

export function createClientHandler({ libraryDir, emit, workspaceOf, libraryState }) {
  const toolCalls = rememberToolCalls();

  return {
    requestPermission: async (params) => {
      const { safe, title, outcome } = permissionOutcome({
        ...params,
        toolCall: toolCalls.complete(params.toolCall, params.sessionId),
      });

      if (!safe) emit({ type: 'agent-blocked', workspaceId: workspaceOf(params.sessionId), title });

      return { outcome };
    },
    sessionUpdate: async (params) => {
      toolCalls.note(params.update, params.sessionId);
      emit({
        type: 'acp-session-update',
        sessionId: params.sessionId,
        workspaceId: workspaceOf(params.sessionId),
        update: params.update,
      });
    },
    writeTextFile: async (params) => {
      const targetPath = path.resolve(path.dirname(libraryDir), params.path);
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
