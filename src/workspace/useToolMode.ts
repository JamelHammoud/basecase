import { useState } from 'react';
import type { LeftTab } from '../components/LeftSidebar';
import type { StudioSubTab } from '../components/SculptAndDrawStudio';
import type { SculptSettings, TransformMode } from '../types/robotics';
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
}

export function useToolMode({ setIsRightOpen, annotations }: ToolModeOptions) {
  const { setCommentMode, setDraft } = annotations;
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [leftTab, setLeftTab] = useState<LeftTab>('parts');
  const [rightTab, setRightTab] = useState<RightTab>('inspector');
  const [creator, setCreator] = useState<CreatorMode | null>(null);
  const [sculptSettings, setSculptSettings] = useState<SculptSettings>(DEFAULT_SCULPT);
  const [attachRequest, setAttachRequest] = useState(0);

  const setMode = (mode: TransformMode) => {
    setTransformMode(mode);
    setCommentMode(false);
    setDraft(null);

    if (mode === 'pose') {
      setIsRightOpen(true);
      setRightTab('pose');
    } else setRightTab((t) => (t === 'pose' ? 'inspector' : t));

    if (mode !== 'sculpt') return;

    setIsRightOpen(true);
    setRightTab('inspector');
    setCreator(null);
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

  const studioMode: StudioSubTab | null = transformMode === 'sculpt' ? 'clay' : creator;

  return {
    transformMode,
    setTransformMode,
    setMode,
    leftTab,
    setLeftTab,
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
  };
}

export type ToolMode = ReturnType<typeof useToolMode>;
