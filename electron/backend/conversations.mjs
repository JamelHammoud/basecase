import fs from 'node:fs';
import path from 'node:path';
import { safeFileId } from './constants.mjs';

const summaryOf = (dir, file) => {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));

    return { id: c.id, title: c.title, updatedAt: c.updatedAt, messageCount: c.messages?.length ?? 0 };
  } catch {
    return null;
  }
};

const conversationFile = (dir, id) => path.join(dir, `${safeFileId(id)}.json`);

export function listConversations(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => summaryOf(dir, f))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function getConversation(dir, id) {
  const file = conversationFile(dir, id);

  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : null;
}

export function saveConversation(dir, conv) {
  const id = safeFileId(conv.id);

  fs.writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({ ...conv, id, updatedAt: new Date().toISOString() }),
    'utf-8',
  );
}

export function deleteConversation(dir, id) {
  const file = conversationFile(dir, id);

  if (fs.existsSync(file)) fs.unlinkSync(file);
}
