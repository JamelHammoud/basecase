import type * as THREE from 'three';
import { findInterferences } from '../interference';
import { BlueprintUnderlay } from './blueprint';
import { focusOn, frameObjects, frameScene, setCameraPreset } from './cameraOps';
import { CanvasSizer } from './canvasSizer';
import { captureScreenshot, captureViews } from './captures';
import { Gizmo } from './gizmo';
import { installKeys } from './keys';
import { MarkInput } from './markInput';
import { MarkLayer } from './markLayer';
import { Marquee } from './marquee';
import * as measure from './measurements';
import { MeasureTool } from './measureTool';
import { PartLayer } from './partLayer';
import { PointerInput } from './pointerInput';
import { RenderLoop } from './renderLoop';
import { createStage, disposeStage } from './stage';
import type { Viewport3DHandle, ViewportProps } from './types';
import type { ViewportContext, ViewportUi } from './viewportContext';
import { installWheel, zoomCamera } from './wheel';

const GIZMO_KEYS: Array<keyof ViewportProps> = [
  'transformMode',
  'snapStepMm',
  'snapAngleDeg',
  'selectedPartIds',
  'parts',
  'poseJoint',
  'pose',
  'measureMode',
  'markMode',
];

const FRAME_BUDGET_MS = 10;

const NEEDS_WHOLE_SCENE: Array<keyof Viewport3DHandle> = [
  'captureScreenshot',
  'captureViews',
  'interference',
  'posedInterference',
  'posedFloor',
  'restBounds',
  'measureParts',
  'partTriangles',
  'servoOutput',
  'sweepClashes',
  'pickAt',
  'frameAll',
  'focusSelected',
  'measureFrom',
];

const changed = (a: ViewportProps, b: ViewportProps, keys: Array<keyof ViewportProps>) =>
  keys.some((k) => a[k] !== b[k]);

export interface EngineOptions {
  container: HTMLElement;
  marquee: () => HTMLElement | null;
  measureLabel: () => HTMLElement | null;
  ui: ViewportUi;
  props: ViewportProps;
  meshVersion: number;
}

export class ViewportEngine {
  readonly ctx: ViewportContext;

  readonly api: Viewport3DHandle;

  private props: ViewportProps;

  private meshVersion: number;

  private readonly gizmo: Gizmo;

  private readonly sizer: CanvasSizer;

  private readonly blueprint: BlueprintUnderlay;

  private readonly measureTool: MeasureTool;

  private readonly markLayer: MarkLayer;

  private readonly markInput: MarkInput;

  private readonly cleanups: Array<() => void>;

  private buildFrame = 0;

  constructor(options: EngineOptions) {
    const stage = createStage(options.container);
    const layer = new PartLayer(stage.partsRoot);
    const loop = new RenderLoop(stage, (id) => layer.get(id));

    this.props = options.props;
    this.meshVersion = options.meshVersion;
    this.ctx = {
      stage,
      layer,
      loop,
      ui: options.ui,
      runtime: { shiftHeld: false, altHeld: false, draggingGizmo: false },
      props: () => this.props,
      applyPose: () => this.applyPose(),
    };
    this.gizmo = new Gizmo(this.ctx);
    this.measureTool = new MeasureTool(this.ctx, options.measureLabel);
    this.markLayer = new MarkLayer(stage.scene, stage.overlays);
    this.markLayer.sync(options.props.marks, options.props.selectedMarkId);
    this.markInput = new MarkInput(this.ctx, this.markLayer);
    loop.afterRender.add(() => this.measureTool.updateLabel());

    const gizmoState = {
      dragging: () => this.ctx.runtime.draggingGizmo,
      hoveringAxis: () => Boolean(this.gizmo.controls.axis),
    };

    this.sizer = new CanvasSizer(stage, () => !loop.paused && loop.renderNow());
    this.blueprint = new BlueprintUnderlay(stage.scene, loop.invalidate);
    stage.orbit.addEventListener('change', loop.invalidate);
    this.cleanups = [
      installWheel(stage, this.ctx.props),
      new Marquee(this.ctx, { element: options.marquee, hoveringAxis: gizmoState.hoveringAxis }).install(),
      this.markInput.install(),
      new PointerInput(this.ctx, gizmoState, this.measureTool).install(),
      installKeys(this.ctx, () => {
        this.gizmo.applySnaps();
        this.measureTool.refresh();
      }),
    ];
    this.api = this.completing(this.handle());
    this.syncScene();
    frameScene(stage, options.props.parts);
    loop.start();
  }

  update(props: ViewportProps, meshVersion: number): void {
    const previous = this.props;
    const meshChanged = meshVersion !== this.meshVersion;

    this.props = props;
    this.meshVersion = meshVersion;
    this.ctx.loop.paused = Boolean(props.paused);
    this.ctx.stage.gridGroup.visible = props.showGrid;
    this.blueprint.set(props.blueprintDataUrl ?? null);

    if (props.sceneKey !== previous.sceneKey) frameScene(this.ctx.stage, props.parts);

    if (props.pose !== previous.pose) this.ctx.layer.pose = props.pose ?? new Map();

    this.syncTools(previous, props);

    if (meshChanged || changed(previous, props, ['parts', 'selectedPartIds'])) this.syncScene();
    else if (props.pose !== previous.pose) this.applyPose();

    if (changed(previous, props, GIZMO_KEYS) || Boolean(previous.onGrab) !== Boolean(props.onGrab))
      this.gizmo.refresh();

    this.ctx.loop.invalidate();
  }

  private syncTools(previous: ViewportProps, props: ViewportProps): void {
    if (previous.measureMode && !props.measureMode) this.measureTool.clear();

    if (previous.measureUnit !== props.measureUnit) this.measureTool.updateLabel();

    if (previous.markMode && !props.markMode) this.markInput.cancel();

    if (changed(previous, props, ['marks', 'selectedMarkId'])) this.markLayer.sync(props.marks, props.selectedMarkId);
  }

  dispose(): void {
    cancelAnimationFrame(this.buildFrame);
    this.ctx.loop.stop();
    this.cleanups.forEach((cleanup) => cleanup());
    this.sizer.dispose();
    this.gizmo.dispose();
    this.measureTool.dispose();
    this.markLayer.dispose();
    this.ctx.layer.dispose();
    disposeStage(this.ctx.stage);
  }

  private handle(): Viewport3DHandle {
    const { ctx } = this;
    const withRest = <T>(run: () => T) => ctx.layer.withRest(run, () => this.applyPose());
    const camera = <T>(run: () => T) => {
      const result = run();

      ctx.loop.invalidate();

      return result;
    };

    return {
      captureScreenshot: () => captureScreenshot(ctx, this.gizmo.controls.getHelper()),
      captureViews: (views, onlyIds, opts) =>
        captureViews(ctx, {
          views,
          onlyIds,
          silhouette: opts?.silhouette,
          helper: this.gizmo.controls.getHelper(),
          marks: opts?.silhouette || onlyIds?.length ? undefined : this.markLayer.bounds(),
        }),
      setCameraPreset: (preset) => camera(() => setCameraPreset(ctx.stage, preset)),
      focusSelected: () => camera(() => focusOn(ctx.stage, ctx.layer.get(this.props.selectedPartIds[0] ?? ''))),
      zoomBy: (factor) => camera(() => zoomCamera(ctx.stage, factor)),
      frameAll: () => this.frameAll(),
      animateSpawn: (ids) => ids.forEach((id) => ctx.loop.spawns.set(id, performance.now())),
      setPose: (deltas) => this.setPose(deltas),
      interference: (onlyIds) =>
        withRest(() => findInterferences(measure.solidObjects(ctx, { visibleOnly: true }), 0.3, 400, onlyIds)),
      posedInterference: (onlyIds) =>
        findInterferences(measure.solidObjects(ctx, { visibleOnly: true }), 0.3, 400, onlyIds).interferences,
      posedFloor: (ids) => measure.posedFloor(ctx, ids),
      restBounds: (ids) => withRest(() => measure.boundsOf(ctx, ids)),
      measureParts: (ids) => withRest(() => measure.measureParts(ctx, ids)),
      partTriangles: (id) => measure.partTriangles(ctx, id),
      servoOutput: (id) => withRest(() => measure.servoOutput(ctx, id)),
      sweepClashes: (moving, origin, axis, anglesDeg) =>
        withRest(() => measure.sweepClashes(ctx, { moving, origin, axis, anglesDeg })),
      pickAt: (x, y) => measure.pickAt(ctx, x, y),
      projectPoints: (points) => measure.projectPoints(ctx, points),
      measureFrom: (x, y) => this.measureTool.startAt(x, y),
      cancelMeasure: () => this.measureTool.clear(),
    };
  }

  private applyPose(): void {
    this.ctx.layer.applyPose(this.gizmo.draggedObject);
    this.ctx.loop.invalidate();
  }

  private setPose(deltas: Map<string, THREE.Matrix4> | null): void {
    this.ctx.layer.pose = deltas ?? new Map();
    this.applyPose();
    this.gizmo.syncHandToPose();
  }

  private syncScene(): void {
    const { parts, selectedPartIds } = this.props;

    this.ctx.layer.sync(parts, new Set(selectedPartIds), this.meshVersion);
    this.afterBuild();
    this.scheduleBuilds();
  }

  private afterBuild(): void {
    this.applyPose();
    this.gizmo.refresh();
  }

  private scheduleBuilds(): void {
    cancelAnimationFrame(this.buildFrame);

    if (!this.ctx.layer.hasPending) {
      return;
    }

    this.buildFrame = requestAnimationFrame(() => {
      this.ctx.layer.buildPending(FRAME_BUDGET_MS);
      this.afterBuild();
      this.scheduleBuilds();
    });
  }

  private completing(api: Viewport3DHandle): Viewport3DHandle {
    const wrapped = { ...api } as Record<string, (...args: never[]) => unknown>;

    for (const key of NEEDS_WHOLE_SCENE) {
      const run = api[key] as (...args: never[]) => unknown;

      wrapped[key] = (...args) => {
        this.complete();

        return run(...args);
      };
    }

    return wrapped as unknown as Viewport3DHandle;
  }

  private complete(): void {
    if (!this.ctx.layer.hasPending) {
      return;
    }

    cancelAnimationFrame(this.buildFrame);
    this.ctx.layer.buildPending();
    this.afterBuild();
  }

  private frameAll(): void {
    const { layer, stage, loop } = this.ctx;
    const objects = layer.objects().flatMap(([id, object]) => (layer.part(id)?.kind === 'image_plane' ? [] : [object]));
    const animation = frameObjects(stage, objects);

    if (animation) loop.frameAnimation = animation;
  }
}
