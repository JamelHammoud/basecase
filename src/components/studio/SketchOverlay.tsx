import React, { useEffect, useRef } from 'react';
import { IconButton } from '../../design-system';
import { applicableConstraints } from '../../utils/sketch/edit';
import type { Inference } from '../../utils/sketch/infer';
import type { Sketch, Vec2 } from '../../utils/sketch/types';
import { ConstraintIcon, CONSTRAINT_NAMES } from './sketchConstraintNames';
import { constraintGlyphs, dimensionLabels, type DimensionLabel, type GlyphKind } from './sketchMarks';
import { formatMm, percentAt, type SketchView } from './sketchView';
import { TYPED_FIELDS, type SketchDrawing } from './useSketchDrawing';
import type { SketchSelection } from './useSketchSelection';

const FIELD =
  'w-[64px] h-[32px] px-2 rounded-lg bg-[#2c2c2c] text-[12px] text-white tabular outline-none ring-1 ring-inset ring-[#0d99ff] shadow-lg';

const Field: React.FC<{
  value: string;
  focused: boolean;
  invalid?: boolean;
  onChange: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
}> = ({ value, focused, invalid, onChange, onKeyDown, onBlur }) => {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = ref.current;

    if (!focused || !el) return;

    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focused]);

  return (
    <input
      ref={ref}
      value={value}
      inputMode="decimal"
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        onKeyDown(e);
      }}
      onBlur={onBlur}
      onPointerDown={(e) => e.stopPropagation()}
      className={`${FIELD} ${invalid ? 'ring-red-500' : ''}`}
    />
  );
};

const Pinned: React.FC<{ view: SketchView; at: Vec2; children: React.ReactNode; below?: boolean }> = ({
  view,
  at,
  children,
  below,
}) => (
  <div
    className={`absolute -translate-x-1/2 ${below ? 'translate-y-2' : '-translate-y-1/2'} flex items-center gap-1`}
    style={percentAt(view, at)}
  >
    {children}
  </div>
);

const labelText = (sketch: Sketch, label: DimensionLabel) => {
  const angle = label.constraint && sketch.constraints.find((c) => c.id === label.constraint)?.kind === 'angle';

  return angle ? `${formatMm(label.value)}°` : formatMm(label.value);
};

interface OverlayProps {
  sketch: Sketch;
  view: SketchView;
  drawing: SketchDrawing;
  selection: SketchSelection;
  typedAt: Vec2 | null;
  refused: boolean;
}

const Dimensions: React.FC<OverlayProps> = ({ sketch, view, selection, refused }) => {
  const { editing } = selection;

  return dimensionLabels(sketch, selection.selected, view.span * 0.035).map((label) => (
    <Pinned key={label.key} view={view} at={label.at}>
      {editing?.label.key === label.key ? (
        <Field
          value={editing.text}
          focused
          invalid={refused}
          onChange={(text) => selection.setEditing({ label, text })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') selection.commitEditing();

            if (e.key === 'Escape') selection.setEditing(null);
          }}
        />
      ) : (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => selection.setEditing({ label, text: formatMm(label.value) })}
          className={`h-6 px-1.5 rounded-md text-[12px] tabular cursor-default ${
            label.constraint ? 'bg-[#2c2c2c] text-white/90' : 'bg-[#2c2c2c]/80 text-white/50'
          } hover:text-white`}
        >
          {labelText(sketch, label)}
        </button>
      )}
    </Pinned>
  ));
};

const Glyphs: React.FC<OverlayProps> = ({ sketch, view, selection }) =>
  constraintGlyphs(sketch, view.span * 0.03).map((g) => (
    <Pinned key={g.key} view={view} at={g.at}>
      <button
        type="button"
        aria-label={CONSTRAINT_NAMES[g.kind]}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => selection.setSelected([g.constraint])}
        className={`w-5 h-5 grid place-items-center rounded-md cursor-default ${
          selection.selected.includes(g.constraint) ? 'bg-[#0d99ff] text-white' : 'bg-[#2c2c2c] text-white/60'
        }`}
      >
        <ConstraintIcon kind={g.kind} className="w-3.5 h-3.5" />
      </button>
    </Pinned>
  ));

const inferredKinds = (hover: Inference | null): GlyphKind[] => {
  if (!hover) return [];

  if (hover.pointId) return ['coincident'];

  return [hover.horizontal && 'horizontal', hover.vertical && 'vertical'].filter((k): k is GlyphKind => !!k);
};

const Inferred: React.FC<OverlayProps> = ({ view, drawing }) => {
  const kinds = inferredKinds(drawing.hover);

  if (!drawing.hover || kinds.length === 0) return null;

  return (
    <div
      className="absolute translate-x-3 -translate-y-7 flex gap-1 pointer-events-none text-[#0d99ff]"
      style={percentAt(view, drawing.hover.at)}
    >
      {kinds.map((k) => (
        <ConstraintIcon key={k} kind={k} className="w-3.5 h-3.5" />
      ))}
    </div>
  );
};

const TypedFields: React.FC<OverlayProps> = ({ view, drawing, typedAt, refused }) => {
  const { typed, pending } = drawing;

  if (!typed || !pending || !typedAt) return null;

  const count = TYPED_FIELDS[pending.kind];
  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && count > 1) {
      e.preventDefault();
      drawing.setTyped({ ...typed, field: typed.field === 0 ? 1 : 0 });
    }

    if (e.key === 'Enter') drawing.submitTyped();

    if (e.key === 'Escape') drawing.setTyped(null);
  };

  return (
    <Pinned view={view} at={typedAt} below>
      {Array.from({ length: count }, (_, i) => (
        <Field
          key={i}
          value={typed.values[i]}
          focused={typed.field === i}
          invalid={refused}
          onChange={(text) => {
            const values: [string, string] = [...typed.values];

            values[i] = text;
            drawing.setTyped({ values, field: i as 0 | 1 });
          }}
          onKeyDown={keyDown}
        />
      ))}
    </Pinned>
  );
};

const ConstraintStrip: React.FC<OverlayProps> = ({ sketch, selection }) => {
  const kinds = applicableConstraints(sketch, selection.selected);

  if (kinds.length === 0 || selection.editing) return null;

  return (
    <div
      className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-0.5 p-0.5 rounded-[10px] bg-[#2c2c2c] shadow-lg"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {kinds.map((kind) => (
        <IconButton
          key={kind}
          size="sm"
          title={CONSTRAINT_NAMES[kind]}
          icon={<ConstraintIcon kind={kind} className="w-4 h-4" />}
          onClick={() => selection.constrain(kind)}
        />
      ))}
    </div>
  );
};

export const SketchOverlay: React.FC<OverlayProps> = (props) => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none [&_button]:pointer-events-auto [&_input]:pointer-events-auto">
    <Glyphs {...props} />
    <Dimensions {...props} />
    <Inferred {...props} />
    <TypedFields {...props} />
    <ConstraintStrip {...props} />
  </div>
);
