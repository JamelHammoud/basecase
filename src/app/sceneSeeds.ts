import type { WorkspaceSeed } from '../SceneWorkspace';
import type { AgentConversation, SavedSceneRecord } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { loadSceneRecord } from '../utils/sceneRecords';
import { seedFromRecord } from './tabModel';

const chatSeed = (chat: AgentConversation | null): WorkspaceSeed['chat'] =>
  chat?.messages?.length
    ? { chatId: chat.id, messages: chat.messages, acpSessionId: chat.acpSessionId ?? null, context: chat.context }
    : undefined;

export async function seedWithChat(record: SavedSceneRecord): Promise<WorkspaceSeed> {
  const chat = record.chatId ? await platformBridge.getChat(record.chatId).catch(() => null) : null;

  return { ...seedFromRecord(record), chat: chatSeed(chat) };
}

export async function loadSceneSeed(id: string): Promise<WorkspaceSeed | null> {
  const record = await loadSceneRecord(id).catch(() => null);

  return record?.id ? seedWithChat(record) : null;
}
