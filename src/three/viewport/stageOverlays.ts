import { AgentFrames } from './agentFrames';
import { CameraGlyphs } from './cameraGlyphs';
import { CheckDots } from './checkDots';
import type { ViewportContext } from './viewportContext';
import { GhostLayer } from './ghostLayer';
import { MatTrack } from './matTrack';
import { DataLayers } from './dataLayers';
import { FrameLabel } from './frameLabel';
import type { Viewport3DHandle, ViewportProps } from './types';

type OverlayHandle = Pick<
  Viewport3DHandle,
  'setDataLayers' | 'dataLayerState' | 'scanPointCount' | 'setMatTrack' | 'setGhost' | 'ghostState' | 'checkDotCount'
>;

export interface OverlayLabels {
  ghost: () => HTMLElement | null;
  frame: () => HTMLElement | null;
}

export class StageOverlays {
  readonly ghost: GhostLayer;

  readonly agentFrames: AgentFrames;

  private readonly cameraGlyphs: CameraGlyphs;

  private readonly dataLayers: DataLayers;

  private readonly frameLabel: FrameLabel;

  private readonly matTrack: MatTrack;

  private readonly checkDots: CheckDots;

  constructor(ctx: ViewportContext, props: ViewportProps, labels: OverlayLabels) {
    const { overlays } = ctx.stage;

    this.cameraGlyphs = new CameraGlyphs(overlays);
    this.cameraGlyphs.sync(props.fixedCameras);
    this.dataLayers = new DataLayers(overlays);
    this.frameLabel = new FrameLabel(ctx, labels.frame, () => this.dataLayers.frames());
    this.matTrack = new MatTrack(overlays);
    this.checkDots = new CheckDots(overlays);
    this.checkDots.sync(props.checkDots);
    this.ghost = new GhostLayer(ctx, labels.ghost);
    this.agentFrames = new AgentFrames(ctx);
    this.agentFrames.sync(props.agentFrames ?? []);
  }

  sync(previous: ViewportProps, props: ViewportProps): void {
    if (previous.agentFrames !== props.agentFrames) this.agentFrames.sync(props.agentFrames ?? []);

    if (previous.fixedCameras !== props.fixedCameras) this.cameraGlyphs.sync(props.fixedCameras);

    if (previous.checkDots !== props.checkDots) this.checkDots.sync(props.checkDots);
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
    };
  }

  dispose(): void {
    this.cameraGlyphs.dispose();
    this.dataLayers.dispose();
    this.frameLabel.dispose();
    this.matTrack.dispose();
    this.checkDots.dispose();
    this.ghost.dispose();
    this.agentFrames.dispose();
  }
}
