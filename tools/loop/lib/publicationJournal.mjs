import fs from 'node:fs';
import path from 'node:path';
import { LOOP_DIR } from './paths.mjs';
import { fingerprint } from './sessionJournal.mjs';

export const workIdentity = (cwd) => `work:${fingerprint(path.resolve(cwd))}`;

const directory = () => path.join(LOOP_DIR, 'state', 'publications');

export function recordPublication(entry, url, publishedSha = entry.sha) {
  const file = path.join(directory(), `${fingerprint(entry.branch)}.json`);
  const temporary = `${file}.${process.pid}.tmp`;
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const workId = workIdentity(entry.dir);
  const record = {
    ...previous,
    branch: entry.branch,
    workId,
    workIds: [...new Set([...(previous.workIds ?? []), previous.workId, workId].filter(Boolean))],
    commits: [...new Set([...(previous.commits ?? []), previous.sha, entry.sha].filter(Boolean))],
    state: url ? 'published' : 'prepared',
    kind: entry.label?.replace('loop:', '') ?? previous.kind,
    sha: entry.sha,
    number: entry.number ?? previous.number ?? null,
    body: entry.body,
    preparedAt: previous.preparedAt ?? entry.createdAt ?? Date.now(),
    ...(url
      ? {
          url,
          publishedSha,
          number: Number(/\/pull\/(\d+)$/.exec(url)?.[1]) || null,
          publishedAt: Date.now(),
        }
      : {}),
  };

  fs.mkdirSync(directory(), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(record));
  fs.renameSync(temporary, file);
}

export function publicationRecords() {
  if (!fs.existsSync(directory())) return [];

  return fs.readdirSync(directory()).flatMap((name) => {
    if (!name.endsWith('.json')) return [];

    try {
      return [JSON.parse(fs.readFileSync(path.join(directory(), name), 'utf8'))];
    } catch {
      return [];
    }
  });
}
