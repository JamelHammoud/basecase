import { useRef, useState, type RefObject } from 'react';
import type { LeftTab } from '../components/LeftSidebar';
import { LAYOUT } from '../design-system';
import type { CameraPreset } from '../types/robotics';
import type { WorkspaceCore } from './useWorkspaceCore';

const FOCUS_TRIES = 10;
const KEY_EDIT_WINDOW_MS = 250;

function focusWhenMounted(inputRef: RefObject<HTMLInputElement | null>) {
  let tries = 0;
  const focus = () => {
    const input = inputRef.current;

    if (input) {
      input.focus();
      input.select();
    } else if (++tries < FOCUS_TRIES) requestAnimationFrame(focus);
  };

  requestAnimationFrame(focus);
}

function useFindParts({ studio, tool }: WorkspaceCore) {
  const partsSearchRef = useRef<HTMLInputElement | null>(null);
  const { setIsLeftOpen } = studio;
  const { setLeftTab } = tool;

  const findParts = () => {
    setIsLeftOpen(true);
    setLeftTab('parts');
    focusWhenMounted(partsSearchRef);
  };

  return { partsSearchRef, findParts };
}

function useKeyEditClock() {
  const lastKeyEditRef = useRef(0);

  return {
    markKeyEdit: () => {
      lastKeyEditRef.current = performance.now();
    },
    recentKeyEdit: () => performance.now() - lastKeyEditRef.current < KEY_EDIT_WINDOW_MS,
  };
}

function usePanelToggles({ studio, tool }: WorkspaceCore) {
  'use memo';

  const { setIsLeftOpen, setIsRightOpen, setPanelWidths, setResizingPanel } = studio;
  const { setShowGrid, setShowReferenceImages, setTrackpadMode, isLeftOpen } = studio;
  const { setLeftTab, leftTab } = tool;

  return {
    toggleLeft: () => setIsLeftOpen((v) => !v),
    toggleRight: () => setIsRightOpen((v) => !v),
    toggleGrid: () => setShowGrid((v) => !v),
    toggleReferenceImages: () => setShowReferenceImages((v) => !v),
    toggleTrackpad: () => setTrackpadMode((m) => (m === 'orbit-scroll' ? 'pan-scroll' : 'orbit-scroll')),
    pickLeftView: (view: LeftTab) => {
      if (isLeftOpen && leftTab === view) {
        setIsLeftOpen(false);

        return;
      }

      setLeftTab(view);
      setIsLeftOpen(true);
    },
    resizeLeft: (left: number) => setPanelWidths((w) => ({ ...w, left })),
    resizeRight: (right: number) => setPanelWidths((w) => ({ ...w, right })),
    collapseLeft: () => {
      setIsLeftOpen(false);
      setPanelWidths((w) => ({ ...w, left: LAYOUT.leftPanelWidth }));
    },
    collapseRight: () => {
      setIsRightOpen(false);
      setPanelWidths((w) => ({ ...w, right: LAYOUT.rightPanelWidth }));
    },
    resizingLeft: (r: boolean) => setResizingPanel(r ? 'left' : null),
    resizingRight: (r: boolean) => setResizingPanel(r ? 'right' : null),
  };
}

export function useWorkspaceUi(core: WorkspaceCore) {
  const { viewportRef, setSelectedIds } = core;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const find = useFindParts(core);
  const clock = useKeyEditClock();
  const panels = usePanelToggles(core);

  const focusSelected = () => viewportRef.current?.focusSelected();

  return {
    ...find,
    ...clock,
    ...panels,
    paletteOpen,
    setPaletteOpen,
    togglePalette: () => setPaletteOpen((v) => !v),
    shapesOpen,
    setShapesOpen,
    toggleShapes: () => setShapesOpen((v) => !v),
    setCameraView: (preset: CameraPreset) => viewportRef.current?.setCameraPreset(preset),
    focusSelected,
    resetView: () => {
      setSelectedIds([]);
      focusSelected();
    },
  };
}

export type WorkspaceUi = ReturnType<typeof useWorkspaceUi>;
