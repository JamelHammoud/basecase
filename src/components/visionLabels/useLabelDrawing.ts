import { useState, type PointerEvent } from 'react';
import type { LabelEditor } from './useLabelEditor';
import type { ImageAnnotation } from '../../vision/frameSet';
import type { LabelPoint } from './labelEditorTypes';

interface LabelDrag {
  start: LabelPoint;
  opposite?: LabelPoint;
  vertex?: number;
  polygon?: number;
}

function selectAt(editor: LabelEditor, annotation: ImageAnnotation | undefined) {
  if (annotation) {
    editor.select(annotation);

    return;
  }

  editor.setSelected(null);
}

function moveLabelVertex(polygons: number[][], drag: LabelDrag, point: LabelPoint): number[][] {
  return polygons.map((ring, polygon) => {
    if (polygon !== drag.polygon) return ring;

    return ring.map((value, index) => {
      if (index === drag.vertex) return point[0];

      if (index === Number(drag.vertex) + 1) return point[1];

      return value;
    });
  });
}

export function useLabelDrawing(editor: LabelEditor) {
  const [draft, setDraft] = useState<LabelPoint[]>([]);
  const [drag, setDrag] = useState<LabelDrag | null>(null);
  const [draftFrame, setDraftFrame] = useState(editor.frame?.id);
  const points = draftFrame === editor.frame?.id ? draft : [];
  const reset = () => {
    setDraft([]);
    setDrag(null);
  };
  const position = (event: PointerEvent<SVGSVGElement>): LabelPoint => {
    const matrix = event.currentTarget.getScreenCTM();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix?.inverse());

    return [Math.max(0, Math.min(editor.frame!.width, point.x)), Math.max(0, Math.min(editor.frame!.height, point.y))];
  };
  const finish = () => {
    if (points.length < 3 || editor.tool !== 'polygon') return;

    void editor.geometry({ polygons: [points.flat()] });
    reset();
  };
  const down = (event: PointerEvent<SVGSVGElement>) => {
    if (editor.busy || !editor.frame || event.button !== 0) return;

    event.currentTarget.focus();
    setDraftFrame(editor.frame.id);

    const point = position(event);
    const target = event.target as SVGElement;
    const instance = target.closest('[data-instance]')?.getAttribute('data-instance');
    const annotation = editor.frame.annotations.find((entry) => entry.instance === instance);

    if (editor.tool === 'select') {
      selectAt(editor, annotation);

      return;
    }

    if (editor.tool === 'keypoint') {
      editor.point(point);

      return;
    }

    if (editor.tool === 'segment') {
      void editor.segment(point);

      return;
    }

    if (target.dataset.corner !== undefined && editor.label) {
      const [x, y, width, height] = editor.label.box;
      const corners: LabelPoint[] = [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ];

      setDrag({ start: point, opposite: corners[(Number(target.dataset.corner) + 2) % 4] });
      setDraft([point, corners[(Number(target.dataset.corner) + 2) % 4]]);
      event.currentTarget.setPointerCapture(event.pointerId);

      return;
    }

    if (target.dataset.vertex !== undefined && editor.label) {
      setDrag({ start: point, vertex: Number(target.dataset.vertex), polygon: Number(target.dataset.polygon) });
      event.currentTarget.setPointerCapture(event.pointerId);

      return;
    }

    if (editor.tool === 'polygon') {
      editor.setSelected(points.length ? editor.selected : null);

      setDraft([...points, point]);

      return;
    }

    editor.setSelected(null);
    setDraft([point, point]);
    setDrag({ start: point });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag || drag.vertex !== undefined) return;

    setDraft([drag.opposite ?? drag.start, position(event)]);
  };
  const up = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag) return;

    const point = position(event);

    if (drag.vertex !== undefined && editor.label) {
      const polygons = moveLabelVertex(editor.label.polygons, drag, point);

      void editor.geometry({ polygons, preserveHoles: true, replace: true });
      reset();

      return;
    }

    const start = drag.opposite ?? drag.start;
    const box: [number, number, number, number] = [
      Math.min(start[0], point[0]),
      Math.min(start[1], point[1]),
      Math.abs(start[0] - point[0]),
      Math.abs(start[1] - point[1]),
    ];

    if (box[2] >= 1 && box[3] >= 1) void editor.geometry({ box, replace: Boolean(drag.opposite) });

    reset();
  };

  return { points, down, move, up, finish, reset };
}

export type LabelDrawing = ReturnType<typeof useLabelDrawing>;
