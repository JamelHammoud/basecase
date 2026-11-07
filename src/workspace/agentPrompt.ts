import type { AcpChatMessage, MessageQuote, ReferenceImageRecord } from '../types/robotics';
import type { EvidenceFolder } from '../utils/evidenceFiles';
import type { AcpPromptPayload } from '../utils/platformBridge';

export interface AgentSendParams {
  text: string;
  images?: ReferenceImageRecord[];
  folders?: EvidenceFolder[];
  quotes?: MessageQuote[];
  targetHeightMm?: number;
  model?: string;
  effort?: string;
  note?: string;
}

export type PromptOptions = Pick<AgentSendParams, 'targetHeightMm' | 'model' | 'effort' | 'note'>;

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
  targetHeightMm: options.targetHeightMm || undefined,
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
