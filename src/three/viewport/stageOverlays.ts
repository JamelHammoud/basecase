import * as THREE from 'three';
import { errorMessage } from '../../utils/errorMessage';
import { AgentFrames } from './agentFrames';
import { CameraGlyphs } from './cameraGlyphs';
import { CaseTrails } from './caseTrails';
import { CheckDots } from './checkDots';
import type { ViewportContext } from './viewportContext';
import { GhostLayer } from './ghostLayer';
import { MatTrack } from './matTrack';
import { DataLayers } from './dataLayers';
import { FrameLabel } from './frameLabel';
import { EarthLayer } from './earthLayer';
import { ImportedWorldLayer } from './importedWorld';
import type { Viewport3DHandle, ViewportProps } from './types';

type OverlayHandle = Pick<
  Viewport3DHandle,
  | 'setDataLayers'
  | 'dataLayerState'
  | 'scanPointCount'
  | 'setMatTrack'
  | 'setGhost'
  | 'ghostState'
  | 'checkDotCount'
  | 'setCaseTrails'
  | 'caseTrailState'
  | 'earthState'
  | 'importedWorldState'
>;

export interface OverlayLabels {
  ghost: () => HTMLElement | null;
  frame: () => HTMLElement | null;
  attribution: () => HTMLElement | null;
}

function showAttribution(label: HTMLElement | null, text: string): void {
  if (!label) return;

  label.textContent = text;
  label.style.display = text ? 'block' : 'none';
}

export class StageOverlays {
  readonly ghost: GhostLayer;

  readonly agentFrames: AgentFrames;

  private readonly cameraGlyphs: CameraGlyphs;

  private readonly dataLayers: DataLayers;

  private readonly frameLabel: FrameLabel;

  private readonly matTrack: MatTrack;

  private readonly caseTrails: CaseTrails;

  private readonly checkDots: CheckDots;

  private readonly earth: EarthLayer;
  private readonly importedWorld: ImportedWorldLayer;

  constructor(ctx: ViewportContext, props: ViewportProps, labels: OverlayLabels) {
    const { overlays, camera, renderer } = ctx.stage;
    const size = new THREE.Vector2();

    this.cameraGlyphs = new CameraGlyphs(overlays);
    this.cameraGlyphs.sync(props.fixedCameras);
    this.dataLayers = new DataLayers(overlays);
    this.frameLabel = new FrameLabel(ctx, labels.frame, () => this.dataLayers.frames());
    this.matTrack = new MatTrack(overlays);
    this.caseTrails = new CaseTrails(ctx);
    this.checkDots = new CheckDots(overlays);
    this.checkDots.sync(props.checkDots);
    this.ghost = new GhostLayer(ctx, labels.ghost);
    this.agentFrames = new AgentFrames(ctx);
    this.agentFrames.sync(props.agentFrames ?? []);
    this.earth = new EarthLayer(overlays, {
      redraw: ctx.loop.redraw,
      attribution: (text) => showAttribution(labels.attribution(), text),
    });
    this.importedWorld = new ImportedWorldLayer(ctx.stage.worldRoot, renderer, ctx.loop.redraw);
    this.setWorld(props);
    void this.earth.set(props.earth ?? null);
    ctx.loop.beforeRender.add(() => {
      renderer.getDrawingBufferSize(size);
      this.earth.update(camera, size.x, size.y);
    });
  }

  sync(previous: ViewportProps, props: ViewportProps): void {
    if (previous.agentFrames !== props.agentFrames) this.agentFrames.sync(props.agentFrames ?? []);

    if (previous.fixedCameras !== props.fixedCameras) this.cameraGlyphs.sync(props.fixedCameras);

    if (previous.checkDots !== props.checkDots) this.checkDots.sync(props.checkDots);

    if (previous.earth !== props.earth) void this.earth.set(props.earth ?? null);

    if (previous.importedWorld !== props.importedWorld) this.setWorld(props);
  }

  handle(redraw: () => void): OverlayHandle {
    return {
      setDataLayers: (input) => {
        if (this.dataLayers.update(input)) redraw();

        return this.dataLayers.state();
      },
      dataLayerState: () => this.dataLayers.state(),
      scanPointCount: () =>
        this.dataLayers
          .state()
          .filter((layer) => layer.kind === 'scan')
          .reduce((n, layer) => n + layer.points, 0),
      setMatTrack: (track) => {
        if (this.matTrack.set(track)) redraw();
      },
      setGhost: (ghost) => this.ghost.set(ghost),
      ghostState: () => this.ghost.state(),
      checkDotCount: () => this.checkDots.count,
      setCaseTrails: (runs, replay) => this.caseTrails.set(runs, replay),
      caseTrailState: () => this.caseTrails.state(),
      earthState: () => this.earth.state(),
      importedWorldState: () => this.importedWorld.state(),
    };
  }

  dispose(): void {
    this.cameraGlyphs.dispose();
    this.dataLayers.dispose();
    this.frameLabel.dispose();
    this.matTrack.dispose();
    this.checkDots.dispose();
    this.caseTrails.dispose();
    this.ghost.dispose();
    this.agentFrames.dispose();
    this.earth.dispose();
    this.importedWorld.dispose();
  }

  private setWorld(props: ViewportProps): void {
    void this.importedWorld.set(props.importedWorld ?? null).catch((error: unknown) => {
      props.onWorldError?.(errorMessage(error));
    });
  }
}
