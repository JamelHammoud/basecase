import type { AcpChatMessage, ReferenceImageRecord } from '../types/robotics';
import type { EvidenceFolder } from '../utils/evidenceFiles';
import type { AcpPromptPayload } from '../utils/platformBridge';

export interface AgentSendParams {
  text: string;
  images?: ReferenceImageRecord[];
  folders?: EvidenceFolder[];
  targetHeightMm?: number;
}

export function buildAgentPrompt(params: AgentSendParams, now: Date) {
  const images = params.images ?? [];
  const folders = params.folders ?? [];
  const time = now.getTime();
  const payload: AcpPromptPayload = {
    action: 'build',
    promptText: params.text,
    imageName: images[0]?.name,
    imageFilePath: images[0]?.filePath,
    imageDataUrls: images.map((i) => i.dataUrl),
    evidenceFolders: folders.map((f) => ({ id: f.id, name: f.name })),
    targetHeightMm: params.targetHeightMm || undefined,
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
