import type { AcpChatMessage, ReferenceImageRecord } from '../types/robotics';
import type { EvidenceFolder } from '../utils/evidenceFiles';
import type { AcpPromptPayload } from '../utils/platformBridge';

export interface AgentSendParams {
  text: string;
  images?: ReferenceImageRecord[];
  folders?: EvidenceFolder[];
  targetHeightMm?: number;
  model?: string;
  effort?: string;
  note?: string;
}

export type PromptOptions = Pick<AgentSendParams, 'targetHeightMm' | 'model' | 'effort' | 'note'>;

const runFields = (text: string, options: PromptOptions) => ({
  action: 'build' as const,
  promptText: options.note ? `${text}\n\n${options.note}` : text,
  targetHeightMm: options.targetHeightMm || undefined,
  model: options.model,
  effort: options.effort,
});

export function resendPayload(user: AcpChatMessage, options: PromptOptions): AcpPromptPayload {
  return {
    ...runFields(user.text, options),
    imageDataUrls: user.imageAttachments ?? [],
    evidenceFolders: (user.folderAttachments ?? []).map((f) => ({ id: f.id, name: f.name })),
  };
}

export function buildAgentPrompt(params: AgentSendParams, now: Date) {
  const images = params.images ?? [];
  const folders = params.folders ?? [];
  const time = now.getTime();
  const payload: AcpPromptPayload = {
    ...runFields(params.text, params),
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
