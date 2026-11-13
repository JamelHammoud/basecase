import { useState } from 'react';
import { evaluateMath } from '../../design-system/numberInputMath';
import { addArc, addCircle, addLine, addRectangle, pointOf, type PointRef } from '../../utils/sketch/edit';
import { alongDirection, inferPoint, type Inference } from '../../utils/sketch/infer';
import type { Sketch, Vec2 } from '../../utils/sketch/types';
import type { SketchTool } from './useStudioDraft';

export interface SketchEditor {
  sketch: Sketch;
  apply: (next: Sketch) => void;
  undo?: () => void;
  redo?: () => void;
}

interface Anchor {
  ref: PointRef;
  at: Vec2;
}

export interface Pending {
  kind: SketchTool;
  first: Anchor;
  second?: Anchor;
}

export interface Typed {
  values: [string, string];
  field: 0 | 1;
}

export const TYPED_FIELDS: Record<SketchTool, number> = { line: 2, rect: 2, circle: 1, arc: 0 };

interface Commit {
  sketch: Sketch;
  next: Pending | null;
}

const parsed = (text: string | undefined) => {
  const v = text?.trim() ? evaluateMath(text) : null;

  return v === null || !Number.isFinite(v) ? undefined : v;
};

const refOf = (inf: Inference): PointRef => (inf.pointId ? { id: inf.pointId } : { at: inf.at });

const distance = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function lineEnd(first: Vec2, end: Inference, typed: Typed | null): Vec2 {
  const length = parsed(typed?.values[0]);
  const angle = parsed(typed?.values[1]);

  if (length === undefined && angle === undefined) return end.at;

  return alongDirection(first, end.at, length ?? distance(first, end.at), angle);
}

function commitLine(sketch: Sketch, first: Anchor, end: Inference, typed: Typed | null): Commit | null {
  const length = parsed(typed?.values[0]);
  const angle = parsed(typed?.values[1]);
  const free = length === undefined && angle === undefined;
  const to: PointRef = free && end.pointId ? { id: end.pointId } : { at: lineEnd(first.at, end, typed) };
  const inferred = { horizontal: angle === undefined && end.horizontal, vertical: angle === undefined && end.vertical };
  const made =
    addLine(sketch, first.ref, to, { length, angle, ...inferred }) ?? addLine(sketch, first.ref, to, { length, angle });

  if (!made) return null;

  const endPoint = pointOf(made.sketch, made.end)!;
  const closed = 'id' in to;

  return {
    sketch: made.sketch,
    next: closed ? null : { kind: 'line', first: { ref: { id: made.end }, at: [endPoint.x, endPoint.y] } },
  };
}

export function rectangleSize(end: Vec2, typed: Typed | null) {
  return { width: parsed(typed?.values[0]), height: parsed(typed?.values[1]), opposite: end };
}

export function circleRadius(first: Vec2, end: Vec2, typed: Typed | null) {
  const diameter = parsed(typed?.values[0]);

  return { radius: diameter === undefined ? distance(first, end) : diameter / 2, typed: diameter !== undefined };
}

function commitShape(sketch: Sketch, pending: Pending, end: Inference, typed: Typed | null): Commit | null {
  if (pending.kind === 'line') return commitLine(sketch, pending.first, end, typed);

  if (pending.kind === 'rect') {
    const made = addRectangle(sketch, { corner: pending.first.ref, ...rectangleSize(end.at, typed) });

    return made && { sketch: made.sketch, next: null };
  }

  if (pending.kind === 'circle') {
    const { radius, typed: exact } = circleRadius(pending.first.at, end.at, typed);
    const made = addCircle(sketch, pending.first.ref, radius, exact);

    return made && { sketch: made.sketch, next: null };
  }

  const made = pending.second && addArc(sketch, pending.first.ref, pending.second.ref, end.at);

  return made ? { sketch: made.sketch, next: null } : null;
}

interface DrawingOptions {
  editor: SketchEditor;
  tool: SketchTool | null;
  grid: number | null;
  onRefuse: () => void;
}

export function useSketchDrawing({ editor, tool, grid, onRefuse }: DrawingOptions) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [hover, setHover] = useState<Inference | null>(null);
  const [typed, setTyped] = useState<Typed | null>(null);
  const { sketch } = editor;

  const infer = (cursor: Vec2, tolerance: number) =>
    inferPoint({ sketch, cursor, from: pending?.kind === 'line' ? pending.first.at : null, tolerance, grid });

  const finish = (end: Inference, values: Typed | null) => {
    if (!pending) return;

    const made = commitShape(sketch, pending, end, values);

    if (!made) {
      onRefuse();

      return;
    }

    editor.apply(made.sketch);
    setPending(made.next);
    setTyped(null);
  };

  const press = (cursor: Vec2, tolerance: number) => {
    if (!tool) return;

    const inf = infer(cursor, tolerance);
    const anchor = { ref: refOf(inf), at: inf.at };

    setHover(inf);

    if (!pending) {
      setPending({ kind: tool, first: anchor });

      return;
    }

    if (pending.kind === 'arc' && !pending.second) {
      setPending({ ...pending, second: anchor });

      return;
    }

    finish(inf, typed);
  };

  const startTyping = (key: string) => {
    if (!pending || TYPED_FIELDS[pending.kind] === 0) return false;

    setTyped({ values: [key, ''], field: 0 });

    return true;
  };

  const cancel = () => {
    if (typed) setTyped(null);
    else setPending(null);
  };

  return {
    pending,
    hover,
    typed,
    move: (cursor: Vec2, tolerance: number) => setHover(tool ? infer(cursor, tolerance) : null),
    leave: () => setHover(null),
    press,
    startTyping,
    setTyped,
    submitTyped: () => finish(hover ?? { at: pending!.first.at, horizontal: false, vertical: false }, typed),
    cancel,
    reset: () => {
      setPending(null);
      setTyped(null);
    },
  };
}

export type SketchDrawing = ReturnType<typeof useSketchDrawing>;
