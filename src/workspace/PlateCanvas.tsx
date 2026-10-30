import { useEffect, useEffectEvent, useRef } from 'react';
import { isModalOpen } from '../design-system';
import type { Plate, PlanItem } from '../print/plan';
import { PlateView } from '../three/plates/plateView';
import type { ScenePart } from '../types/robotics';
import type { Printing } from './usePrinting';

interface PlateCanvasProps {
  active: boolean;
  printing: Printing;
  parts: ScenePart[];
}

interface Drag {
  item: PlanItem;
  startX: number;
  startZ: number;
  dx: number;
  dz: number;
  moved: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

function useKeys(printing: Printing, plates: Plate[], active: boolean) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const mode = printing.mode;
    const target = e.target as HTMLElement | null;

    if (!active || !mode || isModalOpen() || target?.closest('input, textarea, select, [contenteditable]')) return;

    const index = plates.findIndex((p) => p.number === mode.plate);
    const actions: Record<string, () => void> = {
      Escape: () => (mode.face ? printing.setFaceMode(false) : printing.closeMode()),
      ArrowRight: () => index < plates.length - 1 && printing.setModePlate(plates[index + 1].number),
      ArrowLeft: () => index > 0 && printing.setModePlate(plates[index - 1].number),
      f: () => mode.selected && printing.setFaceMode(!mode.face),
      r: () => mode.selected && turnPart(printing, plates[index], mode.selected),
    };
    const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];

    if (!action || e.metaKey || e.ctrlKey) return;

    e.preventDefault();
    action();
  });

  useEffect(() => {
    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function createView(container: HTMLElement): PlateView | null {
  try {
    return new PlateView(container);
  } catch (e) {
    console.warn('[plates] WebGL unavailable', e);

    return null;
  }
}

export function turnPart(printing: Printing, plate: Plate | undefined, id: string) {
  const item = plate?.items.find((it) => it.id === id && it.copy === 0);

  if (!item || !plate) return;

  printing.setPartPrint([id], { turned: item.yaw !== 90, at: [item.x, item.y], plate: plate.local });
}

export function PlateCanvas({ active, printing, parts }: PlateCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<PlateView | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const plan = printing.report?.plan;
  const plates = plan?.plates ?? [];
  const plate = plates.find((p) => p.number === printing.mode?.plate) ?? plates[0];

  useKeys(printing, plates, active);

  useEffect(() => {
    const view = createView(containerRef.current!);

    if (!view) return;

    viewRef.current = view;

    return () => {
      view.dispose();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (plan) viewRef.current?.setBed(plan.bed);
  }, [plan]);

  const selected = printing.mode?.selected ?? null;
  const reselect = useEffectEvent(() => viewRef.current?.select(selected));

  useEffect(() => {
    void viewRef.current?.showPlate(plate?.items ?? [], parts).then(reselect);
  }, [plate, parts]);

  useEffect(() => {
    viewRef.current?.select(selected);
  }, [selected]);

  const onPointerDown = (e: React.PointerEvent) => {
    const view = viewRef.current;
    const hit = e.button === 0 ? view?.pick(e.clientX, e.clientY) : null;

    if (!view || !hit) return;

    if (printing.mode?.face) {
      printing.setPartPrint([hit.id], { down: hit.normal, at: undefined, turned: undefined });
      printing.setFaceMode(false);

      return;
    }

    const item = plate?.items.find((it) => it.id === hit.id && it.copy === hit.copy);
    const start = view.bedPoint(e.clientX, e.clientY);

    printing.selectPart(hit.id);

    if (!item || !start || item.copy !== 0 || item.yaw % 90 !== 0) return;

    dragRef.current = { item, startX: start.x, startZ: start.z, dx: 0, dz: 0, moved: false };
    view.setOrbit(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const point = drag && viewRef.current?.bedPoint(e.clientX, e.clientY);

    if (!drag || !point || !plan) return;

    const { item } = drag;

    drag.dx = clamp(point.x - drag.startX, -item.x, plan.bed.width - item.w - item.x);
    drag.dz = clamp(point.z - drag.startZ, -(plan.bed.depth - item.d - item.y), item.y);
    drag.moved ||= Math.hypot(drag.dx, drag.dz) > 0.5;
    viewRef.current?.dragOffset(item.id, drag.dx, drag.dz);
  };

  const onPointerUp = () => {
    const drag = dragRef.current;

    dragRef.current = null;
    viewRef.current?.setOrbit(true);

    if (!drag?.moved || !plate) return;

    const at: [number, number] = [
      Math.round((drag.item.x + drag.dx) * 10) / 10,
      Math.round((drag.item.y - drag.dz) * 10) / 10,
    ];

    printing.setPartPrint([drag.item.id], { plate: plate.local, at, turned: drag.item.yaw === 90 });
  };

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-[5] w-full h-full rounded-[12px] ${printing.mode?.face ? 'cursor-crosshair' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
