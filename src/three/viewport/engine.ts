import type * as THREE from 'three';
import { fastenerInput } from '../../assembly/fastenerSpec';
import {
  assemblyIn,
  fastenersIn,
  interferenceIn,
  measuresIn,
  visibilityIn,
  printMeshesIn,
  printReportsIn,
  sweepsIn,
  threeMfIn,
} from '../analysis/analysisPool';
import { snapshotShapes } from '../analysis/sceneShapes';
import { exportUsdz } from '../usdz/usdzExport';
import { AgentFrames } from './agentFrames';
import { BlueprintUnderlay } from './blueprint';
import { focusOn, frameObjects, frameScene, setCameraPreset } from './cameraOps';
import { CanvasSizer } from './canvasSizer';
import { captureScreenshot, captureViews } from './captures';
import { silhouetteShots } from './fitCapture';
import { Gizmo } from './gizmo';
import { installKeys } from './keys';
import { MarkInput } from './markInput';
import { MarkLayer } from './markLayer';
import { Marquee } from './marquee';
import * as measure from './measurements';
import { MeasureTool } from './measureTool';
import { PartBatches } from './partBatches';
import { PartLayer } from './partLayer';
import { PointerInput } from './pointerInput';
import { RenderLoop } from './renderLoop';
import { ScaleFigures } from './scaleFigures';
import { SelectionOutline } from './selectionOutline';
import { warmShaders } from './shaderWarmup';
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

const FIGURE_KEYS: Array<keyof ViewportProps> = ['figures', 'humanHeightMm', 'measureKind', 'measureMode'];

const FRAME_BUDGET_MS = 6;

const interferenceOptions = (focus?: string[]) => ({ toleranceMm: 0.3, maxSamples: 400, focus });

const NEEDS_WHOLE_SCENE: Array<keyof Viewport3DHandle> = [
  'captureScreenshot',
  'captureViews',
  'interference',
  'fastenerChains',
  'assembly',
  'posedInterference',
  'posedFloor',
  'restBounds',
  'silhouetteShots',
  'measureParts',
  'visibleShares',
  'printShapes',
  'printMeshes',
  'printThreeMf',
  'exportUsdz',
  'partTriangles',
  'servoOutput',
  'sweepClashes',
  'pickAt',
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

  private readonly figures: ScaleFigures;

  private readonly markLayer: MarkLayer;

  private readonly markInput: MarkInput;

  private readonly agentFrames: AgentFrames;

  private readonly cleanups: Array<() => void>;

  private buildFrame = 0;

  private frameWhenBuilt = false;

  constructor(options: EngineOptions) {
    const stage = createStage(options.container);
    const batches = new PartBatches();

    batches.attach(stage.scene);

    const layer = new PartLayer(stage.partsRoot, () => this.scheduleBuilds(), batches);
    const loop = new RenderLoop(stage, (id) => layer.get(id));

    this.props = options.props;
    this.meshVersion = options.meshVersion;
    this.ctx = {
      stage,
      layer,
      batches,
      loop,
      ui: options.ui,
      runtime: { shiftHeld: false, altHeld: false, draggingGizmo: false },
      props: () => this.props,
      applyPose: () => this.applyPose(),
    };
    this.gizmo = new Gizmo(this.ctx);
    this.measureTool = new MeasureTool(this.ctx, options.measureLabel);
    this.figures = new ScaleFigures(this.ctx);
    this.markLayer = new MarkLayer(stage.scene, stage.overlays);
    this.markLayer.sync(options.props.marks, options.props.selectedMarkId);
    this.markInput = new MarkInput(this.ctx, this.markLayer);
    this.agentFrames = new AgentFrames(this.ctx);
    this.agentFrames.sync(options.props.agentFrames ?? []);

    const outline = new SelectionOutline(stage);

    loop.beforeRender.add(() => outline.prepare(this.props.selectedPartIds.flatMap((id) => layer.get(id) ?? [])));
    loop.afterRender.add(() => this.measureTool.updateLabel());
    loop.afterRender.add(() => {
      if (this.agentFrames.refresh()) loop.invalidate();
    });

    const gizmoState = {
      dragging: () => this.ctx.runtime.draggingGizmo,
      hoveringAxis: () => Boolean(this.gizmo.controls.axis),
    };

    this.sizer = new CanvasSizer(stage, () => !loop.paused && loop.renderNow());
    this.blueprint = new BlueprintUnderlay(stage.scene, loop.invalidate);
    stage.orbit.addEventListener('change', loop.noteInteraction);
    stage.renderer.domElement.addEventListener('wheel', loop.noteInteraction, { passive: true });
    this.cleanups = [
      installWheel(stage, this.ctx.props),
      new Marquee(this.ctx, { element: options.marquee, hoveringAxis: gizmoState.hoveringAxis }).install(),
      this.markInput.install(),
      new PointerInput(this.ctx, gizmoState, { measure: this.measureTool, figures: this.figures }).install(),
      installKeys(this.ctx, () => {
        this.gizmo.applySnaps();
        this.measureTool.refresh();
      }),
      () => outline.dispose(),
    ];
    this.api = this.completing(this.handle());
    this.syncScene();
    frameScene(stage, options.props.parts);
    loop.start();
    this.cleanups.push(warmShaders(stage, loop.invalidate));
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

    if (previous.measureKind !== props.measureKind) this.measureTool.leave();

    if (changed(previous, props, FIGURE_KEYS)) this.figures.sync();

    if (previous.markMode && !props.markMode) this.markInput.cancel();

    if (changed(previous, props, ['marks', 'selectedMarkId'])) this.markLayer.sync(props.marks, props.selectedMarkId);

    if (previous.agentFrames !== props.agentFrames) this.agentFrames.sync(props.agentFrames ?? []);
  }

  dispose(): void {
    cancelAnimationFrame(this.buildFrame);
    this.ctx.loop.stop();
    this.cleanups.forEach((cleanup) => cleanup());
    this.ctx.stage.renderer.domElement.removeEventListener('wheel', this.ctx.loop.noteInteraction);
    this.sizer.dispose();
    this.gizmo.dispose();
    this.measureTool.dispose();
    this.figures.dispose();
    this.markLayer.dispose();
    this.agentFrames.dispose();
    this.ctx.layer.dispose();
    this.ctx.batches.dispose();
    disposeStage(this.ctx.stage);
  }

  private handle(): Viewport3DHandle {
    const { ctx } = this;
    const withRest = <T>(run: () => T) => ctx.layer.withRest(run, () => this.applyPose());
    const unbatched = <T>(run: () => T) => ctx.batches.unbatched(run);
    const solidShapes = (visibleOnly: boolean) => snapshotShapes(measure.solidObjects(ctx, { visibleOnly }));
    const camera = <T>(run: () => T) => {
      const result = run();

      ctx.loop.invalidate();

      return result;
    };

    return {
      captureScreenshot: () => captureScreenshot(ctx, this.gizmo.controls.getHelper()),
      captureViews: (views, onlyIds, opts) => {
        const run = () =>
          captureViews(ctx, {
            views,
            onlyIds,
            silhouette: opts?.silhouette,
            labels: opts?.labels,
            grid: opts?.grid,
            maxSide: opts?.maxSide,
            helper: this.gizmo.controls.getHelper(),
            marks: opts?.silhouette || onlyIds?.length ? undefined : this.markLayer.bounds(),
          });

        return onlyIds?.length || opts?.silhouette || opts?.labels ? unbatched(run) : run();
      },
      setCameraPreset: (preset) => camera(() => setCameraPreset(ctx.stage, preset)),
      focusSelected: () => camera(() => focusOn(ctx.stage, ctx.layer.get(this.props.selectedPartIds[0] ?? ''))),
      zoomBy: (factor) => camera(() => zoomCamera(ctx.stage, factor)),
      frameAll: () => this.frameAll(),
      animateSpawn: (ids) => ids.forEach((id) => ctx.loop.spawns.set(id, performance.now())),
      setPose: (deltas) => this.setPose(deltas),
      interference: (onlyIds) =>
        interferenceIn(
          withRest(() => solidShapes(true)),
          interferenceOptions(onlyIds),
        ),
      fastenerChains: () =>
        fastenersIn(
          withRest(() => solidShapes(false)),
          fastenerInput(this.props.parts),
        ),
      assembly: (options) =>
        assemblyIn(
          withRest(() => solidShapes(false)),
          { ...fastenerInput(this.props.parts), ...options },
        ),
      posedInterference: (onlyIds, riders) =>
        interferenceIn(solidShapes(true), { ...interferenceOptions(onlyIds), riders }).then((r) => r.interferences),
      posedFloor: (ids) => measure.posedFloor(ctx, ids),
      restBounds: (ids) => withRest(() => measure.boundsOf(ctx, ids)),
      silhouetteShots: (specs, opts) =>
        unbatched(() => silhouetteShots(ctx, { specs, ...opts, helper: this.gizmo.controls.getHelper() })),
      measureParts: (ids) => measuresIn(withRest(() => snapshotShapes(measure.partObjects(ctx, ids)))),
      visibleShares: () => visibilityIn(withRest(() => solidShapes(true))),
      printShapes: (ids, faces) => printReportsIn(snapshotShapes(measure.partObjects(ctx, ids)), faces),
      printMeshes: (ids) => printMeshesIn(snapshotShapes(measure.partObjects(ctx, ids))),
      printThreeMf: (files, plateSize) =>
        threeMfIn(
          snapshotShapes(measure.partObjects(ctx, [...new Set(files.flatMap((f) => f.items.map((i) => i.id)))])),
          files,
          plateSize,
        ),
      exportUsdz: () => exportUsdz(measure.solidObjects(ctx, { visibleOnly: true })),
      partTriangles: (id) => measure.partTriangles(ctx, id),
      servoOutput: (id) => withRest(() => measure.servoOutput(ctx, id)),
      sweepClashes: (sweeps) =>
        sweepsIn(
          withRest(() => solidShapes(false)),
          sweeps,
        ),
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

    if (this.frameWhenBuilt && !this.ctx.layer.hasPending) this.frameAll();
  }

  private scheduleBuilds(): void {
    cancelAnimationFrame(this.buildFrame);

    if (!this.ctx.layer.hasReady) {
      return;
    }

    this.buildFrame = requestAnimationFrame(() => {
      if (this.ctx.layer.buildPending(FRAME_BUDGET_MS)) this.afterBuild();

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
    this.ctx.layer.buildAll();
    this.afterBuild();
  }

  private frameAll(): void {
    const { layer, stage, loop } = this.ctx;

    this.frameWhenBuilt = layer.hasPending;

    if (this.frameWhenBuilt) return;

    const objects = layer.objects().flatMap(([id, object]) => (layer.part(id)?.kind === 'image_plane' ? [] : [object]));
    const animation = frameObjects(stage, objects);

    if (animation) loop.frameAnimation = animation;
  }
}
