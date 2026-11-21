import type { RefObject } from 'react';
import type { VersionRequest, VersionView } from './versionOperations';
import type { VersionPartOriginals } from './sceneVersions';

interface RunActions {
  historyRef: RefObject<string | undefined>;
  chatIdRef: RefObject<string | undefined>;
  request: (request: Omit<VersionRequest, 'history' | 'scene'>) => Promise<VersionView>;
}

export function useVersionRunActions({ historyRef, chatIdRef, request }: RunActions) {
  'use memo';

  return {
    setChat: (id: string | null) => {
      chatIdRef.current = id ?? undefined;
    },
    begin: (run: string, chatId?: string) => {
      chatIdRef.current = chatId ?? chatIdRef.current;

      return request({ action: 'begin', run, chatId: chatIdRef.current });
    },
    finish: (run: string, selected?: string[], originals?: VersionPartOriginals) =>
      request({ action: 'finish', run, selected, originals }),
    finishAll: async (live: string[] = [], owned: Record<string, VersionPartOriginals> = {}) => {
      if (!historyRef.current) return;

      const current = await request({ action: 'view' });

      for (const run of Object.keys(current.activeRuns).filter((key) => !live.includes(key)))
        await request({ action: 'finish', run, selected: Object.keys(owned[run] ?? {}), originals: owned[run] });
    },
  };
}
