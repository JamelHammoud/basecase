import { useEffect, useState } from 'react';
import { loadPanelWidths, writeStored, type PanelWidths } from './storedSettings';

export function usePanelLayout() {
  const [isLeftOpen, setIsLeftOpen] = useState<boolean>(true);
  const [isRightOpen, setIsRightOpen] = useState<boolean>(true);
  const [panelWidths, setPanelWidths] = useState<PanelWidths>(loadPanelWidths);
  const [resizingPanel, setResizingPanel] = useState<'left' | 'right' | null>(null);
  const [rightIslandWidth, setRightIslandWidth] = useState(200);

  useEffect(() => {
    writeStored('panel-widths', panelWidths);
  }, [panelWidths]);

  return {
    isLeftOpen,
    setIsLeftOpen,
    isRightOpen,
    setIsRightOpen,
    panelWidths,
    setPanelWidths,
    resizingPanel,
    setResizingPanel,
    rightIslandWidth,
    setRightIslandWidth,
  };
}
