import { useState } from 'react';
import { repairPrintParts } from '../print/repairPlate';
import type { PartPrint, ScenePart } from '../types/robotics';

export interface PrintMode {
  plate: number;
  selected: string | null;
  face: boolean;
}

interface ModeState {
  scene: string;
  mode: PrintMode | null;
  repairId: string | null;
  repairPrint?: PartPrint;
}

interface ModeOptions {
  jobId: string;
  parts: ScenePart[];
  fit: { active: boolean; leave: () => void; start: () => Promise<boolean> };
}

const opened = (plate = 1, selected: string | null = null): PrintMode => ({ plate, selected, face: false });

export function usePrintMode({ jobId, parts, fit }: ModeOptions) {
  const [state, setState] = useState<ModeState>({ scene: jobId, mode: null, repairId: null });

  if (state.scene !== jobId) setState({ scene: jobId, mode: null, repairId: null });

  const openMode = (plate = 1) => {
    fit.leave();
    setState({ scene: jobId, mode: opened(plate), repairId: null });
  };
  const openRepairPlate = (id: string) => {
    if (!repairPrintParts(parts, id).length) return;

    fit.leave();
    setState({ scene: jobId, mode: opened(1, id), repairId: id });
  };
  const closeMode = () => {
    setState({ scene: jobId, mode: fit.active ? opened() : null, repairId: null });
    fit.leave();
  };
  const startFitTest = async () => {
    if (await fit.start()) setState({ scene: jobId, mode: opened(), repairId: null });
  };
  const editRepairPrint = (ids: string[], patch: Partial<PartPrint>): boolean => {
    if (!state.repairId) return false;

    if (ids.includes(state.repairId)) setState((prev) => ({ ...prev, repairPrint: { ...prev.repairPrint, ...patch } }));

    return true;
  };

  return {
    mode: state.mode,
    repairId: state.repairId,
    repairPrint: state.repairPrint,
    repairPart: state.repairId ? repairPrintParts(parts, state.repairId, state.repairPrint)[0] : undefined,
    editRepairPrint,
    canMerge: !!state.mode && !fit.active && !state.repairId,
    openMode,
    openRepairPlate,
    closeMode,
    startFitTest,
    setModePlate: (plate: number) => setState((prev) => ({ ...prev, mode: opened(plate) })),
    selectPart: (selected: string | null) =>
      setState((prev) => ({ ...prev, mode: prev.mode && { ...prev.mode, selected, face: false } })),
    setFaceMode: (face: boolean) => setState((prev) => ({ ...prev, mode: prev.mode && { ...prev.mode, face } })),
  };
}
