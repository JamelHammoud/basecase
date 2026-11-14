import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { SettingsPane } from '../app/settingsPanes';
import type { Plate } from '../print/plan';
import { printBridge } from '../print/printBridge';
import { QUOTES_PER_ROUND, quotesWanted, stlItems, withQuotes, type QuoteRequest } from '../print/serviceQuotes';
import type { Viewport3DHandle } from '../three/viewport/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { localDate } from '../utils/bomTypes';
import { errorMessage } from '../utils/errorMessage';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { Setter, ShowToast } from './types';

export interface ServiceQuotesOptions {
  parts: ScenePart[];
  project: ProjectSettings;
  setProject: Setter<ProjectSettings>;
  plates: Plate[];
  viewport: () => Viewport3DHandle | null;
  enabled: boolean;
  showToast: ShowToast;
  openSettings: (pane: SettingsPane) => void;
}

const SETTLE_MS = 1500;
const RETRY_MS = 60_000;

async function quoteRound(asked: QuoteRequest[], options: ServiceQuotesOptions) {
  try {
    const stls = (await options.viewport()?.printStl(stlItems(asked, options.plates))) ?? {};
    const shapes = asked.flatMap((a) =>
      stls[a.part] ? [{ part: a.part, name: a.name, material: a.material, copies: a.copies, stl: stls[a.part] }] : [],
    );

    return shapes.length ? await printBridge.quote(shapes) : { replies: [], error: undefined };
  } catch (e) {
    return { replies: [], error: errorMessage(e) };
  }
}

export function useServiceQuotes(options: ServiceQuotesOptions) {
  const { parts, project, setProject, enabled } = options;
  const busy = useRef(false);
  const shownError = useRef<string | undefined>(undefined);
  const [round, setRound] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const asking = enabled && !waiting && !IS_WEB_DEMO;
  const wantedKey = asking
    ? quotesWanted(parts, project)
        .map((a) => a.key)
        .join(',')
    : '';

  const run = useEffectEvent(async () => {
    const asked = quotesWanted(parts, project).slice(0, QUOTES_PER_ROUND);

    if (!asked.length || busy.current) return;

    busy.current = true;

    const { replies, error } = await quoteRound(asked, options);
    const answered = new Set(replies.map((r) => r.part));

    if (replies.length)
      setProject((p) => ({ ...p, quotes: withQuotes(p.quotes, asked, { replies, checkedAt: localDate(), parts }) }));

    if (asked.some((a) => !answered.has(a.part))) setWaiting(true);

    if (error && error !== shownError.current) options.showToast(error, { tone: 'error' });

    shownError.current = error;
    busy.current = false;
    setRound((n) => n + 1);
  });

  useEffect(() => {
    if (!wantedKey) return;

    const timer = window.setTimeout(() => void run(), SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [wantedKey, round]);

  useEffect(() => {
    if (!waiting) return;

    const timer = window.setTimeout(() => setWaiting(false), RETRY_MS);

    return () => window.clearTimeout(timer);
  }, [waiting]);

  const choose = async () => {
    const status = await printBridge.service().catch(() => null);

    if (!status?.hasKey) return options.openSettings('accounts');

    shownError.current = undefined;
    setWaiting(false);
    setProject((p) => ({ ...p, madeBy: 'service' }));
  };

  return { choose };
}

export type ServiceQuotes = ReturnType<typeof useServiceQuotes>;
