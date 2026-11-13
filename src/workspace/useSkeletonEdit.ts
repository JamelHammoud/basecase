import { useRef, useState } from 'react';
import { toCad } from '../agent/agentFrame';
import { dragJoint } from '../agent/skeletonDrag';
import { templateSkeleton, type SkeletonTemplate } from '../agent/skeletonTemplates';
import type { SkeletonDragEvent } from '../three/viewport/types';
import type { ScenePart } from '../types/robotics';
import type { RobotSkeleton, ZUpVec } from '../types/skeleton';
import { servoUp, skeletonMargins, withActuator } from '../utils/skeletonMargins';
import { skeletonView } from './skeletonView';
import type { SceneDocument } from './useSceneDocument';

export interface JointDragStep {
  id: string;
  delta: ZUpVec;
  phase: SkeletonDragEvent['phase'];
  alone?: boolean;
}

interface DragStart {
  skeleton: RobotSkeleton;
  parts: ScenePart[];
}

export function useSkeletonEdit(docs: SceneDocument) {
  const { project, projectRef, partsRef, commitParts, updateProjectNow, recordSkeletonEdit } = docs;
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<DragStart | null>(null);
  const skeleton = project.skeleton;
  const margins = skeletonMargins(skeleton);

  const replace = (next: RobotSkeleton) => {
    recordSkeletonEdit(projectRef.current.skeleton);
    updateProjectNow((p) => ({ ...p, skeleton: next }));
  };

  const moveJoint = (step: JointDragStep) => {
    const from = dragRef.current;

    if (!from) return;

    const dragged = dragJoint(from.skeleton, from.parts, step);

    if (dragged.parts.some((p, i) => p !== partsRef.current[i])) commitParts(() => dragged.parts, true);

    updateProjectNow((p) => ({ ...p, skeleton: dragged.skeleton }));
  };

  const drag = (step: JointDragStep) => {
    const now = projectRef.current.skeleton;

    if (step.phase === 'start' && now) dragRef.current = { skeleton: now, parts: partsRef.current };

    if (step.phase === 'move') moveJoint(step);

    if (step.phase !== 'end' || !dragRef.current) return;

    recordSkeletonEdit(dragRef.current.skeleton);
    dragRef.current = null;
  };

  const upgrade = (id: string) => {
    const current = projectRef.current.skeleton;
    const up = servoUp(current?.joints.find((j) => j.id === id)?.actuator);

    setMenu(null);

    if (current && up) replace(withActuator(current, id, up.key));
  };

  return {
    editing,
    setEditing,
    skeleton,
    margins,
    view: editing && skeleton ? skeletonView(skeleton, margins) : null,
    start: (id: SkeletonTemplate['id']) => replace(templateSkeleton(id)),
    drag,
    onViewportDrag: ({ id, delta, phase, alone }: SkeletonDragEvent) => drag({ id, delta: toCad(delta), phase, alone }),
    menu,
    openMenu: (id: string, at: { x: number; y: number }) => setMenu({ id, ...at }),
    closeMenu: () => setMenu(null),
    upgrade,
  };
}

export type SkeletonEdit = ReturnType<typeof useSkeletonEdit>;
