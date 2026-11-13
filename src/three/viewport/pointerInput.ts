import type * as THREE from 'three';
import type { MeasureTool } from './measureTool';
import type { ScaleFigures } from './scaleFigures';
import { floorPoint, hitPartId, rayAt, raycastParts, raycastUnlocked } from './picking';
import { SculptInput } from './sculptInput';
import type { Vec3 } from './types';
import type { ViewportContext } from './viewportContext';
import { hasPrimaryModifier } from '../../utils/os';
import { drillTarget } from '../../booleans/picking';

const CLICK_SLOP = 5;

export interface MeasureInputs {
  measure: MeasureTool;
  figures: ScaleFigures;
}

export interface GizmoState {
  dragging: () => boolean;
  hoveringAxis: () => boolean;
}

const additive = (e: MouseEvent) => e.shiftKey || hasPrimaryModifier(e);

const toVec3 = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];

export class PointerInput {
  private down = { x: 0, y: 0 };

  private readonly sculpt: SculptInput;

  private readonly ctx: ViewportContext;

  private readonly gizmo: GizmoState;

  private readonly measure: MeasureTool;

  private readonly figures: ScaleFigures;

  constructor(ctx: ViewportContext, gizmo: GizmoState, { measure, figures }: MeasureInputs) {
    this.ctx = ctx;
    this.gizmo = gizmo;
    this.measure = measure;
    this.figures = figures;
    this.sculpt = new SculptInput(ctx);
  }

  install(): () => void {
    const canvas = this.ctx.stage.renderer.domElement;
    const listeners: Array<[string, (e: never) => void]> = [
      ['pointerdown', (e: PointerEvent) => this.onDown(e)],
      ['pointermove', (e: PointerEvent) => this.onMove(e)],
      ['pointerup', (e: PointerEvent) => this.onUp(e)],
      ['dblclick', (e: MouseEvent) => this.onDoubleClick(e)],
      ['pointerleave', () => this.leave()],
    ];

    listeners.forEach(([type, fn]) => canvas.addEventListener(type, fn as EventListener));

    return () => listeners.forEach(([type, fn]) => canvas.removeEventListener(type, fn as EventListener));
  }

  private leave(): void {
    this.measure.leave();
    this.figures.leave();
  }

  private placingFigure(): boolean {
    const { measureMode, measureKind } = this.ctx.props();

    return Boolean(measureMode) && measureKind !== undefined && measureKind !== 'ruler';
  }

  private moved(e: MouseEvent): boolean {
    return Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > CLICK_SLOP;
  }

  private onDown(e: PointerEvent): void {
    const { annotateMode, measureMode, markMode, transformMode, buildStep } = this.ctx.props();
    const otherTool = annotateMode || measureMode || markMode || buildStep;

    this.down = { x: e.clientX, y: e.clientY };

    if (!otherTool && transformMode === 'sculpt' && e.button === 0) this.sculpt.begin(e);
  }

  private axisAt(e: PointerEvent, click: boolean): void {
    const { axisPick, onAxisPick } = this.ctx.props();
    const hit = raycastParts(this.ctx.stage, e.clientX, e.clientY);
    const part = hitPartId(hit);

    onAxisPick?.(hit && part && axisPick?.parts.includes(part) ? { part, point: toVec3(hit.point) } : null, click);
  }

  private onMove(e: PointerEvent): void {
    const cursor = this.ctx.stage.brushCursor;

    if (this.ctx.props().axisPick) {
      this.axisAt(e, false);

      return;
    }

    if (this.placingFigure()) {
      this.figures.hoverAt(e.clientX, e.clientY);

      return;
    }

    if (this.ctx.props().measureMode) {
      this.measure.hoverAt(e.clientX, e.clientY);

      return;
    }

    if (this.ctx.props().transformMode === 'sculpt') {
      this.sculpt.hover(e);

      return;
    }

    if (!cursor.visible) {
      return;
    }

    cursor.visible = false;
    this.ctx.loop.invalidate();
  }

  private onUp(e: PointerEvent): void {
    if (this.sculpt.active) {
      this.sculpt.end();

      return;
    }

    const { markMode, buildStep } = this.ctx.props();

    if (this.gizmo.dragging() || e.button !== 0 || this.moved(e) || markMode || buildStep) {
      return;
    }

    if (this.ctx.props().axisPick) {
      this.axisAt(e, true);

      return;
    }

    if (this.ctx.props().measureMode) {
      this.measureClick(e);

      return;
    }

    if (this.ctx.props().annotateMode) {
      this.placeAnnotation(e);

      return;
    }

    this.select(e);
  }

  private measureClick(e: PointerEvent): void {
    if (e.ctrlKey) return;

    if (this.placingFigure()) this.figures.clickAt(e.clientX, e.clientY);
    else this.measure.clickAt(e.clientX, e.clientY);
  }

  private placeAnnotation(e: PointerEvent): void {
    const { stage } = this.ctx;
    const place = this.ctx.props().onPlaceAnnotation;
    const hit = raycastParts(stage, e.clientX, e.clientY);

    if (hit) {
      place?.(toVec3(hit.point), hitPartId(hit));

      return;
    }

    const floor = floorPoint(rayAt(stage, e.clientX, e.clientY));

    if (floor) place?.([floor.x, 0, floor.z], null);
  }

  private pickedId(e: MouseEvent, hit: THREE.Intersection | null, drill: boolean): string | null {
    const partId = hitPartId(hit);
    const part = partId ? this.ctx.layer.part(partId) : undefined;

    if (!hit || !part) return partId;

    return drillTarget({
      part,
      raycaster: rayAt(this.ctx.stage, e.clientX, e.clientY),
      distance: hit.distance,
      selected: new Set(this.ctx.props().selectedPartIds),
      drill,
    });
  }

  private select(e: PointerEvent): void {
    const { onSelectPart, onPickPoint } = this.ctx.props();
    const deep = hasPrimaryModifier(e);
    const hit = deep
      ? raycastParts(this.ctx.stage, e.clientX, e.clientY)
      : raycastUnlocked(this.ctx, e.clientX, e.clientY);
    const partId = this.pickedId(e, hit, deep);

    if (partId && hit) {
      onPickPoint?.(partId, toVec3(hit.point));
      onSelectPart(partId, e.shiftKey, deep || partId !== hitPartId(hit));

      return;
    }

    if (!additive(e)) onSelectPart(null);
  }

  private onDoubleClick(e: MouseEvent): void {
    const { annotateMode, measureMode, markMode, transformMode, onSelectPart, onOpenPart, axisPick, buildStep } =
      this.ctx.props();
    const blocked =
      annotateMode ||
      measureMode ||
      markMode ||
      axisPick ||
      buildStep ||
      transformMode === 'sculpt' ||
      this.gizmo.hoveringAxis();

    if (e.button !== 0 || additive(e) || blocked || this.moved(e)) {
      return;
    }

    const partId = this.pickedId(e, raycastUnlocked(this.ctx, e.clientX, e.clientY), true);

    if (!partId) return;

    onSelectPart(partId, false, true);
    onOpenPart?.(partId);
  }
}
