import { useEffect, useEffectEvent, useRef } from 'react';
import { scenePreview } from '../three/scenePreview';
import { buildAIHandoffPayload } from '../utils/aiHandoff';
import { platformBridge } from '../utils/platformBridge';
import { sceneJson } from '../utils/sceneJson';
import { sceneStore } from '../utils/sceneStore';
import { useLatestRef } from '../utils/useLatestRef';
import { draftChanged, draftPayload, type SceneDraft } from './sceneDraft';

const SAVE_DELAY_MS = 1200;
const PREVIEW_EVERY_MS = 20_000;

interface AutosaveOptions {
  draft: SceneDraft;
  active: boolean;
  pristine: boolean;
  unsaved: boolean;
}

interface PreviewState {
  stale: boolean;
  at: number;
  timer: number;
}

function useScenePreviews(savedRef: React.RefObject<SceneDraft>, activeRef: React.RefObject<boolean>) {
  'use memo';

  const previewRef = useRef<PreviewState>({ stale: false, at: 0, timer: 0 });

  const refresh = async () => {
    const state = previewRef.current;
    const draft = savedRef.current;

    window.clearTimeout(state.timer);
    state.timer = 0;

    if (!state.stale) return;

    state.stale = false;
    state.at = Date.now();

    const fields = await scenePreview(draft.parts);

    sceneStore.upsert(
      await platformBridge.saveScenePreview({ id: draft.sceneId, ...fields, current: activeRef.current }),
    );
  };

  const schedule = () => {
    const state = previewRef.current;

    state.stale = true;

    if (state.timer) return;

    const wait = Math.max(0, state.at + PREVIEW_EVERY_MS - Date.now());

    state.timer = window.setTimeout(() => void refresh().catch(() => {}), wait);
  };

  const cancel = () => {
    window.clearTimeout(previewRef.current.timer);
    previewRef.current.timer = 0;
  };

  const forget = () => {
    cancel();
    previewRef.current.stale = false;
  };

  return { refresh, schedule, cancel, forget };
}

export function useAutosave({ draft, active, pristine, unsaved }: AutosaveOptions) {
  'use memo';

  const savedRef = useRef<SceneDraft>(draft);
  const unsavedRef = useRef(unsaved);
  const pendingRef = useRef<SceneDraft | null>(null);
  const timerRef = useRef(0);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const discardedRef = useRef(false);
  const activeRef = useLatestRef(active);
  const previews = useScenePreviews(savedRef, activeRef);

  const write = async (next: SceneDraft) => {
    const handoff = activeRef.current
      ? buildAIHandoffPayload(next.sceneName, next.globalGoal, next.parts, next.annotations)
      : {};

    sceneStore.upsert(await platformBridge.saveSceneJson(await sceneJson({ ...draftPayload(next), ...handoff })));
    previews.schedule();
  };

  const flush = () => {
    window.clearTimeout(timerRef.current);

    const next = pendingRef.current;

    if (!next || discardedRef.current) return chainRef.current;

    pendingRef.current = null;
    savedRef.current = next;
    chainRef.current = chainRef.current.then(() => write(next)).catch(() => {});

    return chainRef.current;
  };

  const discard = () => {
    discardedRef.current = true;
    pendingRef.current = null;
    window.clearTimeout(timerRef.current);
    previews.cancel();
  };

  const onDraft = useEffectEvent((next: SceneDraft, isPristine: boolean) => {
    if (next.sceneId !== savedRef.current.sceneId) {
      savedRef.current = next;
      pendingRef.current = null;
      previews.forget();

      return;
    }

    if (isPristine || discardedRef.current) return;

    if (!unsavedRef.current && !draftChanged(savedRef.current, next)) return;

    unsavedRef.current = false;
    pendingRef.current = next;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
  });

  const onBackground = useEffectEvent(() => {
    if (discardedRef.current) return;

    void flush().then(() => previews.refresh().catch(() => {}));
  });

  const stopTimers = useEffectEvent(() => {
    window.clearTimeout(timerRef.current);
    previews.cancel();
  });

  useEffect(() => onDraft(draft, pristine), [draft, pristine]);

  useEffect(() => {
    if (!active) onBackground();
  }, [active]);

  useEffect(() => () => stopTimers(), []);

  return {
    flush: async () => {
      await flush();
      await previews.refresh().catch(() => {});
    },
    discard,
  };
}

export type Autosave = ReturnType<typeof useAutosave>;
