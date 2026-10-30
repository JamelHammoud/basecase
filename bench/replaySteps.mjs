const SCENE_TOOLS = /model_part|add_parts|update_parts|delete_parts|mirror_parts/;

const isSceneStep = (c) => c.status === 'completed' && c.input && SCENE_TOOLS.test(c.name ?? '');

export function stepsFromEvents(lines, { stopAtCall } = {}) {
  const calls = new Map();

  for (const line of lines) {
    const u = line?.update;

    if (!u?.toolCallId) continue;

    const prev = calls.get(u.toolCallId) ?? { order: calls.size };
    const name = u._meta?.claudeCode?.toolName ?? prev.name;

    if (u.rawInput && Object.keys(u.rawInput).length) prev.input = u.rawInput;

    if (u.status) prev.status = u.status;

    if (name) prev.name = name;

    calls.set(u.toolCallId, prev);
  }

  const ordered = [...calls.values()].sort((a, b) => a.order - b.order);
  const cut = stopAtCall === undefined ? ordered : ordered.slice(0, stopAtCall);

  return cut.filter(isSceneStep);
}

function flattenCalls(calls, out) {
  for (const c of calls ?? []) {
    out.push({ name: c.toolName ?? c.title, input: c.rawInput, status: c.status });
    flattenCalls(c.children, out);
  }

  return out;
}

export function stepsFromConversation(conversation, { stopAt } = {}) {
  const messages = conversation.messages ?? [];
  const upto = stopAt === undefined ? messages : messages.slice(0, stopAt);

  return upto.flatMap((m) => flattenCalls(m.toolCalls, [])).filter(isSceneStep);
}

export function messageAt(conversation, index) {
  const m = conversation.messages?.[index];

  if (!m) throw new Error(`The chat has ${conversation.messages?.length ?? 0} messages; there is no message ${index}.`);

  return m;
}

export function userMessages(conversation) {
  return (conversation.messages ?? [])
    .map((m, index) => ({ index, role: m.role, text: m.text }))
    .filter((m) => m.role === 'user' && m.text?.trim());
}

export const STEP_OPS = [
  [/add_parts/, (inp) => (inp.parts ?? []).map((p) => ({ op: 'add', part: p }))],
  [/update_parts/, (inp) => (inp.updates ?? []).map((u) => ({ op: 'update', part: u }))],
  [/delete_parts/, (inp) => (inp.ids ?? []).map((id) => ({ op: 'delete', id }))],
  [/mirror_parts/, (inp) => [{ op: 'mirror', ids: inp.ids, axis: inp.axis, rename: inp.rename ?? {} }]],
];
