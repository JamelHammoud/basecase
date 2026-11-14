import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { SettingsPane } from '../app/settingsPanes';
import type { Plate } from '../print/plan';
import { printBridge } from '../print/printBridge';
import { quotesWanted, stlItems, withQuotes, type QuoteRequest } from '../print/serviceQuotes';
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

async function quoteShapes(asked: QuoteRequest[], options: ServiceQuotesOptions) {
  const stls = (await options.viewport()?.printStl(stlItems(asked, options.plates))) ?? {};
  const shapes = asked.flatMap((a) =>
    stls[a.part] ? [{ part: a.part, name: a.name, material: a.material, copies: a.copies, stl: stls[a.part] }] : [],
  );

  return shapes.length ? printBridge.quote(shapes) : [];
}

export function useServiceQuotes(options: ServiceQuotesOptions) {
  const { parts, project, setProject, enabled } = options;
  const busy = useRef(false);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const wanted = enabled && !IS_WEB_DEMO ? quotesWanted(parts, project, failed).map((a) => a.key) : [];

  const run = useEffectEvent(async () => {
    const asked = quotesWanted(parts, project, failed);

    if (!asked.length || busy.current) return;

    busy.current = true;

    try {
      const replies = await quoteShapes(asked, options);
      const answered = new Set(replies.map((r) => r.part));
      const unanswered = asked.filter((a) => !answered.has(a.part)).map((a) => a.key);

      setProject((p) => ({ ...p, quotes: withQuotes(p.quotes, asked, { replies, checkedAt: localDate() }) }));
      setFailed((prev) => (unanswered.length ? new Set([...prev, ...unanswered]) : prev));
    } catch (e) {
      setFailed((prev) => new Set([...prev, ...asked.map((a) => a.key)]));
      options.showToast(errorMessage(e), { tone: 'error' });
    } finally {
      busy.current = false;
    }
  });

  const wantedKey = wanted.join(',');

  useEffect(() => {
    if (!wantedKey) return;

    const timer = window.setTimeout(() => void run(), SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [wantedKey]);

  const choose = async () => {
    const status = await printBridge.service().catch(() => null);

    if (!status?.hasKey) return options.openSettings('accounts');

    setFailed(new Set());
    setProject((p) => ({ ...p, madeBy: 'service' }));
  };

  return { choose };
}

export type ServiceQuotes = ReturnType<typeof useServiceQuotes>;
