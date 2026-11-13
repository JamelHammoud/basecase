import { useState } from 'react';
import { resampled } from '../../linkage/linkageFrames';
import { MAX_PATH_POINTS, type Vec2 } from '../../utils/linkage';

export interface SketchPathEditor {
  points: Vec2[];
  onChange: (points: Vec2[]) => void;
}

type Gesture = { kind: 'drag'; index: number } | { kind: 'stroke'; stroke: Vec2[]; tolerance: number };

const snapped = (at: Vec2, grid: number | null): Vec2 =>
  grid ? [Math.round(at[0] / grid) * grid, Math.round(at[1] / grid) * grid] : at;

const near = (a: Vec2, b: Vec2, tolerance: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;

const strokeLength = (stroke: Vec2[]) =>
  stroke.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - stroke[i - 1][0], p[1] - stroke[i - 1][1]) : 0), 0);

function usePathHistory(editor: SketchPathEditor) {
  const [past, setPast] = useState<Vec2[][]>([]);
  const [future, setFuture] = useState<Vec2[][]>([]);

  const commit = (next: Vec2[]) => {
    setPast([...past, editor.points]);
    setFuture([]);
    editor.onChange(next);
  };

  const undo = () => {
    if (!past.length) return;

    setPast(past.slice(0, -1));
    setFuture([editor.points, ...future]);
    editor.onChange(past[past.length - 1]);
  };

  const redo = () => {
    if (!future.length) return;

    setPast([...past, editor.points]);
    setFuture(future.slice(1));
    editor.onChange(future[0]);
  };

  return { commit, undo, redo };
}

export function useSketchPath(editor: SketchPathEditor, grid: number | null) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [preview, setPreview] = useState<Vec2[] | null>(null);
  const history = usePathHistory(editor);

  const press = (at: Vec2, tolerance: number) => {
    const index = editor.points.findIndex((p) => near(p, at, tolerance));

    setGesture(index >= 0 ? { kind: 'drag', index } : { kind: 'stroke', stroke: [at], tolerance });
  };

  const move = (at: Vec2) => {
    if (gesture?.kind === 'drag') {
      setPreview(editor.points.map((p, i) => (i === gesture.index ? snapped(at, grid) : p)));

      return;
    }

    if (gesture?.kind !== 'stroke' || near(gesture.stroke[gesture.stroke.length - 1], at, gesture.tolerance)) return;

    const stroke = [...gesture.stroke, at];

    setGesture({ ...gesture, stroke });
    setPreview(resampled(stroke, MAX_PATH_POINTS));
  };

  const release = () => {
    if (gesture?.kind === 'drag' && preview) history.commit(preview);

    if (gesture?.kind === 'stroke') finishStroke(gesture.stroke, gesture.tolerance);

    setGesture(null);
    setPreview(null);
  };

  const finishStroke = (stroke: Vec2[], tolerance: number) => {
    if (strokeLength(stroke) > tolerance * 3) {
      history.commit(resampled(stroke, MAX_PATH_POINTS).map((p) => snapped(p, grid)));

      return;
    }

    if (editor.points.length < MAX_PATH_POINTS) history.commit([...editor.points, snapped(stroke[0], grid)]);
  };

  const dropLast = () => {
    if (editor.points.length) history.commit(editor.points.slice(0, -1));
  };

  return {
    shown: preview ?? editor.points,
    dragging: !!gesture,
    press,
    move,
    release,
    dropLast,
    undo: history.undo,
    redo: history.redo,
  };
}

export type SketchPath = ReturnType<typeof useSketchPath>;
