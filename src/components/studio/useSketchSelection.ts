import { useState } from 'react';
import { evaluateMath } from '../../design-system/numberInputMath';
import {
  addConstraint,
  dragPoint,
  entityOf,
  removeItems,
  setConstraintValue,
  setDimension,
  type ApplyKind,
} from '../../utils/sketch/edit';
import type { Sketch, Vec2 } from '../../utils/sketch/types';
import { hitTest, type DimensionLabel } from './sketchMarks';
import type { SketchEditor } from './useSketchDrawing';

export interface Editing {
  label: DimensionLabel;
  text: string;
}

interface Drag {
  point: string;
  preview: Sketch | null;
}

const isCircle = (sketch: Sketch, id?: string) => !!id && entityOf(sketch, id)?.kind === 'circle';

function valueFor(sketch: Sketch, label: DimensionLabel, shown: number) {
  return isCircle(sketch, label.entity) ? shown / 2 : shown;
}

function withDimension(sketch: Sketch, label: DimensionLabel, shown: number) {
  const value = valueFor(sketch, label, shown);

  if (label.constraint) return setConstraintValue(sketch, label.constraint, value);

  return label.entity ? setDimension(sketch, label.entity, value) : null;
}

interface SelectionOptions {
  editor: SketchEditor;
  grid: number | null;
  onRefuse: () => void;
}

const snapped = (p: Vec2, grid: number | null): Vec2 =>
  grid ? [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid] : p;

export function useSketchSelection({ editor, grid, onRefuse }: SelectionOptions) {
  const [selected, setSelected] = useState<string[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const { sketch } = editor;
  const present = selected.filter(
    (id) =>
      sketch.points.some((p) => p.id === id) || entityOf(sketch, id) || sketch.constraints.some((c) => c.id === id),
  );

  const applyOrRefuse = (next: Sketch | null) => {
    if (!next) {
      onRefuse();

      return false;
    }

    editor.apply(next);

    return true;
  };

  const press = (cursor: Vec2, tolerance: number, additive: boolean) => {
    const hit = hitTest(sketch, cursor, tolerance);

    setEditing(null);

    if (hit?.point && !additive) {
      setSelected([hit.point]);
      setDrag({ point: hit.point, preview: null });

      return;
    }

    const id = hit?.point ?? hit?.entity;

    if (!id && !additive) setSelected([]);

    if (!id) return;

    setSelected((prev) => {
      if (!additive) return [id];

      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };

  return {
    selected: present,
    setSelected,
    preview: drag?.preview ?? null,
    dragging: !!drag,
    editing,
    setEditing,
    press,
    move: (cursor: Vec2) => {
      if (!drag) return;

      setDrag({ ...drag, preview: dragPoint(sketch, drag.point, snapped(cursor, grid)) ?? drag.preview });
    },
    release: () => {
      if (drag?.preview) editor.apply(drag.preview);

      setDrag(null);
    },
    remove: () => {
      if (present.length === 0) return;

      editor.apply(removeItems(sketch, present));
      setSelected([]);
    },
    constrain: (kind: ApplyKind) => applyOrRefuse(addConstraint(sketch, kind, present)),
    commitEditing: () => {
      const shown = editing ? evaluateMath(editing.text) : null;

      if (!editing || shown === null || !applyOrRefuse(withDimension(sketch, editing.label, shown))) return;

      setEditing(null);
    },
  };
}

export type SketchSelection = ReturnType<typeof useSketchSelection>;
