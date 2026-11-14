import type { Case } from '../cases/schema';
import type { AcpChatMessage, MessageQuote, ReferenceImageRecord } from '../types/robotics';
import type { EvidenceFolder } from '../utils/evidenceFiles';
import type { AcpPromptPayload } from '../utils/platformBridge';

export interface AgentSendParams {
  text: string;
  images?: ReferenceImageRecord[];
  folders?: EvidenceFolder[];
  quotes?: MessageQuote[];
  model?: string;
  effort?: string;
  note?: string;
}

export type PromptOptions = Pick<AgentSendParams, 'model' | 'effort' | 'note'>;

function agentConsole({ console: caseConsole }: Pick<Case, 'console'>) {
  if (!caseConsole) return undefined;

  const { input, signals, panels, layout } = caseConsole;

  return {
    input,
    ...(signals ? { signals } : {}),
    panels: panels.map((p) =>
      p.kind === 'code' ? { ...p, source: undefined, bytes: new TextEncoder().encode(p.source).length } : p,
    ),
    layout,
  };
}

const arrangedConsole = (kase: Pick<Case, 'console'>) => {
  const arranged = agentConsole(kase);

  return arranged
    ? `\nIts console as the user arranged it, code sources left out: ${JSON.stringify(arranged)}\nKeep that arrangement when you change the app.`
    : '';
};

export const runningCaseNote = (kase: Pick<Case, 'id' | 'name' | 'console'> | null) =>
  kase
    ? `(The user is running the Case ${kase.name} (${kase.id}) and watching it. This message is about that Case, as with /case: change its app with write_case_code, and leave the design alone unless the words ask.)${arrangedConsole(kase)}`
    : '';

export const joinNotes = (...notes: string[]) => notes.filter(Boolean).join('\n\n') || undefined;

const quoteForAgent = (quote: MessageQuote) => {
  const lines = [quote.text, quote.context].filter(Boolean).join('\n').split('\n');

  return [`Quoted from ${quote.source}:`, ...lines.map((line) => `> ${line}`)].join('\n');
};

export function withQuotes(text: string, quotes: MessageQuote[] = []): string {
  return [...quotes.map(quoteForAgent), text].filter(Boolean).join('\n\n');
}

const runFields = (text: string, options: PromptOptions) => ({
  action: 'build' as const,
  promptText: options.note ? `${text}\n\n${options.note}` : text,
  model: options.model,
  effort: options.effort,
});

export function resendPayload(user: AcpChatMessage, options: PromptOptions): AcpPromptPayload {
  return {
    ...runFields(withQuotes(user.text, user.quotes), options),
    imageDataUrls: user.imageAttachments ?? [],
    evidenceFolders: (user.folderAttachments ?? []).map((f) => ({ id: f.id, name: f.name })),
  };
}

export function buildAgentPrompt(params: AgentSendParams, now: Date) {
  const images = params.images ?? [];
  const folders = params.folders ?? [];
  const time = now.getTime();
  const payload: AcpPromptPayload = {
    ...runFields(withQuotes(params.text, params.quotes), params),
    imageName: images[0]?.name,
    imageFilePath: images[0]?.filePath,
    imageDataUrls: images.map((i) => i.dataUrl),
    evidenceFolders: folders.map((f) => ({ id: f.id, name: f.name })),
  };
  const userMessage: AcpChatMessage = {
    id: `msg-user-${time}`,
    role: 'user',
    text: params.text,
    timestamp: now.toISOString(),
    imageAttachments: images.map((i) => i.dataUrl),
    folderAttachments: folders.length
      ? folders.map((f) => ({ id: f.id, name: f.name, fileCount: f.fileCount }))
      : undefined,
    quotes: params.quotes?.length ? params.quotes : undefined,
  };
  const agentMessage: AcpChatMessage = {
    id: `msg-agent-${time + 1}`,
    role: 'agent',
    text: '',
    timestamp: now.toISOString(),
    toolCalls: [],
  };

  return { payload, userMessage, agentMessage };
}
