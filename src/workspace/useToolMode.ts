import { useState } from 'react';
import type { LeftTab } from '../components/LeftSidebar';
import type { StudioSubTab } from '../components/SculptAndDrawStudio';
import type { MessageQuote, SculptSettings, TransformMode } from '../types/robotics';
import type { Annotations } from './useAnnotations';
import type { CreatorMode, RightTab, Setter } from './types';

const DEFAULT_SCULPT: SculptSettings = {
  brush: 'inflate',
  radiusMm: 16,
  strength: 0.45,
  symmetryX: true,
  symmetryZ: false,
};

interface ToolModeOptions {
  setIsRightOpen: Setter<boolean>;
  annotations: Pick<Annotations, 'setCommentMode' | 'setDraft'>;
  measure: { measuring: boolean; setMeasuring: (on: boolean) => void };
  mark: { marking: boolean; setMarking: (on: boolean) => void };
}

const SCENE_VIEWS: ReadonlySet<LeftTab> = new Set(['cases', 'routines']);

export function useToolMode({ setIsRightOpen, annotations, measure, mark }: ToolModeOptions) {
  const { setCommentMode, setDraft } = annotations;
  const { measuring, setMeasuring } = measure;
  const { marking, setMarking } = mark;
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [leftTab, setLeftTab] = useState<LeftTab>('parts');
  const [rightTab, setRightTab] = useState<RightTab>('inspector');
  const [creator, setCreator] = useState<CreatorMode | null>(null);
  const [sculptSettings, setSculptSettings] = useState<SculptSettings>(DEFAULT_SCULPT);
  const [attachRequest, setAttachRequest] = useState(0);
  const [sketchRequest, setSketchRequest] = useState(0);
  const [quoteRequest, setQuoteRequest] = useState<MessageQuote | null>(null);
  const [composeRequest, setComposeRequest] = useState<string | null>(null);

  const setMode = (mode: TransformMode) => {
    setTransformMode(mode);
    setCommentMode(false);
    setDraft(null);
    setMeasuring(false);
    setMarking(false);

    if (mode === 'pose') {
      setIsRightOpen(true);
      setRightTab('pose');
    } else setRightTab((t) => (t === 'pose' ? 'inspector' : t));

    if (mode !== 'sculpt') return;

    setIsRightOpen(true);
    setRightTab('inspector');
    setCreator(null);
  };

  const toggleMeasure = (on?: boolean) => {
    const next = on ?? !measuring;

    setMeasuring(next);

    if (!next) return;

    setCommentMode(false);
    setDraft(null);
    setMarking(false);
    setTransformMode((m) => (m === 'sculpt' ? 'translate' : m));
  };

  const toggleMarking = (on?: boolean) => {
    const next = on ?? !marking;

    setMarking(next);

    if (!next) return;

    setCommentMode(false);
    setDraft(null);
    setMeasuring(false);
    setTransformMode((m) => (m === 'sculpt' ? 'translate' : m));
  };

  const openCreator = (mode: CreatorMode) => {
    setIsRightOpen(true);
    setRightTab('inspector');
    setCreator(mode);
  };

  const openRightTab = (tab: RightTab) => {
    setIsRightOpen(true);
    setRightTab(tab);
  };

  const requestAttach = () => {
    openRightTab('acp');
    setAttachRequest((n) => n + 1);
  };

  const requestSketch = () => {
    openRightTab('acp');
    setSketchRequest((n) => n + 1);
  };

  const requestQuote = (quote: MessageQuote) => {
    openRightTab('acp');
    setQuoteRequest(quote);
  };

  const requestCompose = (text: string) => {
    openRightTab('acp');
    setComposeRequest(text);
  };

  const studioMode: StudioSubTab | null = transformMode === 'sculpt' ? 'clay' : creator;

  return {
    transformMode,
    setTransformMode,
    setMode,
    measuring,
    toggleMeasure,
    marking,
    toggleMarking,
    leftTab,
    setLeftTab,
    leaveSceneView: () => setLeftTab((tab) => (SCENE_VIEWS.has(tab) ? 'parts' : tab)),
    rightTab,
    setRightTab,
    openRightTab,
    creator,
    setCreator,
    openCreator,
    studioMode,
    sculptSettings,
    updateSculptSettings: (patch: Partial<SculptSettings>) => setSculptSettings((s) => ({ ...s, ...patch })),
    attachRequest,
    requestAttach,
    sketchRequest,
    quoteRequest,
    requestQuote,
    clearQuote: () => setQuoteRequest(null),
    composeRequest,
    requestCompose,
    clearCompose: () => setComposeRequest(null),
    requestSketch,
  };
}

export type ToolMode = ReturnType<typeof useToolMode>;
