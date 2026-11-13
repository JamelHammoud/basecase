import React from 'react';
import { arcPoints, sketchLoops } from '../../utils/sketch/profile';
import type { Sketch, SketchEntity, Vec2 } from '../../utils/sketch/types';
import { gridLines, gridStep, toSvg, type SketchView } from './sketchView';

const ACCENT = '#0d99ff';

const thin = { vectorEffect: 'non-scaling-stroke' as const };

const path = (pts: Vec2[], closed = false) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${toSvg(p)[0]} ${toSvg(p)[1]}`).join(' ') + (closed ? ' Z' : '');

export const SketchGrid: React.FC<{ view: SketchView }> = ({ view }) => {
  const step = gridStep(view);
  const lines = gridLines(view);
  const far = view.span * 2;

  return (
    <g>
      {lines.map((g) => {
        const major = Math.abs(g) < step / 2;
        const stroke = major ? '#404040' : '#262626';

        return (
          <React.Fragment key={g}>
            <line x1={g} y1={-view.cy - far} x2={g} y2={-view.cy + far} stroke={stroke} strokeWidth={1} style={thin} />
            <line x1={view.cx - far} y1={-g} x2={view.cx + far} y2={-g} stroke={stroke} strokeWidth={1} style={thin} />
          </React.Fragment>
        );
      })}
    </g>
  );
};

const at = (sketch: Sketch) => {
  const map = new Map(sketch.points.map((p) => [p.id, [p.x, p.y] as Vec2]));

  return (id: string) => map.get(id) ?? ([0, 0] as Vec2);
};

function entityPath(sketch: Sketch, e: SketchEntity) {
  const p = at(sketch);

  if (e.kind === 'line') return path([p(e.a), p(e.b)]);

  if (e.kind === 'arc') return path(arcPoints(p(e.c), p(e.a), p(e.b)));

  const [cx, cy] = toSvg(p(e.c));

  return `M${cx - e.r} ${cy} a${e.r} ${e.r} 0 1 0 ${e.r * 2} 0 a${e.r} ${e.r} 0 1 0 ${-e.r * 2} 0`;
}

const entityStroke = (e: SketchEntity, selected: boolean) => {
  if (selected) return '#ffffff';

  return e.kind === 'line' && e.ref ? '#737373' : ACCENT;
};

export const SketchEntities: React.FC<{ sketch: Sketch; selected: string[]; view: SketchView }> = ({
  sketch,
  selected,
  view,
}) => {
  const loops = sketchLoops(sketch);
  const radius = view.span * 0.008;

  return (
    <g>
      {loops.length > 0 && (
        <path d={loops.map((l) => path(l, true)).join(' ')} fill={ACCENT} fillOpacity={0.14} fillRule="evenodd" />
      )}
      {sketch.entities.map((e) => (
        <path
          key={e.id}
          d={entityPath(sketch, e)}
          fill="none"
          stroke={entityStroke(e, selected.includes(e.id))}
          strokeWidth={selected.includes(e.id) ? 2.5 : 2}
          strokeDasharray={e.kind === 'line' && e.ref ? '5 4' : undefined}
          strokeLinecap="round"
          style={thin}
        />
      ))}
      {sketch.points
        .filter((p) => !p.fixed)
        .map((p) => {
          const [x, y] = toSvg([p.x, p.y]);

          return (
            <circle
              key={p.id}
              cx={x}
              cy={y}
              r={radius}
              fill={selected.includes(p.id) ? ACCENT : '#ffffff'}
              stroke={ACCENT}
              strokeWidth={1.5}
              style={thin}
            />
          );
        })}
    </g>
  );
};

export interface PreviewShape {
  lines: Array<[Vec2, Vec2]>;
  circle?: { c: Vec2; r: number };
  arc?: Vec2[];
  guides: Array<[Vec2, Vec2]>;
}

export const SketchPreview: React.FC<{ preview: PreviewShape }> = ({ preview }) => (
  <g pointerEvents="none">
    {preview.guides.map(([a, b], i) => (
      <path key={`g${i}`} d={path([a, b])} stroke={ACCENT} strokeOpacity={0.5} strokeDasharray="3 4" style={thin} />
    ))}
    {preview.lines.map(([a, b], i) => (
      <path key={`l${i}`} d={path([a, b])} stroke={ACCENT} strokeWidth={2} strokeLinecap="round" style={thin} />
    ))}
    {preview.circle && (
      <circle
        cx={toSvg(preview.circle.c)[0]}
        cy={toSvg(preview.circle.c)[1]}
        r={preview.circle.r}
        fill="none"
        stroke={ACCENT}
        strokeWidth={2}
        style={thin}
      />
    )}
    {preview.arc && <path d={path(preview.arc)} fill="none" stroke={ACCENT} strokeWidth={2} style={thin} />}
  </g>
);
