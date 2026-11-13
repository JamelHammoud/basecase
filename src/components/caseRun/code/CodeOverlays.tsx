import React from 'react';
import type { OverlayAnchor } from '../../../cases/console/format';
import type { PlacedOverlay } from '../../../cases/console/layout';
import { LAYOUT } from '../../../design-system';
import { codeFrameKey, type PanelContext } from '../panelContext';
import { CodeFrame } from './CodeFrame';

const INSET = LAYOUT.cardPadding;

const EDGES: Record<OverlayAnchor, Array<'top' | 'right' | 'bottom' | 'left'>> = {
  'top-left': ['top', 'left'],
  top: ['top', 'left', 'right'],
  'top-right': ['top', 'right'],
  left: ['top', 'bottom', 'left'],
  fill: ['top', 'right', 'bottom', 'left'],
  right: ['top', 'right', 'bottom'],
  'bottom-left': ['bottom', 'left'],
  bottom: ['bottom', 'left', 'right'],
  'bottom-right': ['bottom', 'right'],
};

const placement = (o: PlacedOverlay): React.CSSProperties => ({
  ...Object.fromEntries(EDGES[o.anchor].map((edge) => [edge, o.anchor === 'fill' ? 0 : INSET])),
  ...(o.width === undefined ? {} : { width: o.width }),
  ...(o.height === undefined ? {} : { height: o.height }),
});

export const CodeOverlays: React.FC<{ overlays: PlacedOverlay[]; ctx: PanelContext }> = ({ overlays, ctx }) =>
  overlays.map((o) => (
    <div
      key={o.panel}
      data-testid="case-run-overlay"
      data-panel={o.panel}
      data-kind="code"
      className="absolute z-10 pointer-events-none"
      style={placement(o)}
    >
      <CodeFrame
        key={codeFrameKey(ctx.bus, o.spec.source)}
        panel={o.spec}
        ctx={ctx}
        pointer={o.pointer === true}
        className="h-full"
      />
    </div>
  ));
