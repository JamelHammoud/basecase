import { useRef, useState } from 'react';
import type { RobotAnimation } from '../types/robotics';
import { buildGait } from '../utils/animation';
import { detectFeet } from '../utils/usePosing';
import { robotPartIds } from './selection';
import type { WorkspaceCore } from './useWorkspaceCore';

const LEG_JOINT = /hip|knee|ankle|leg|haa|kfe/i;

export interface MotionSource {
  name: string;
  text: string;
}

export function usePoseActions({ posing, parts, setSelectedIds, tool, showToast }: WorkspaceCore) {
  const { setMode } = tool;
  const { addAnimation, play } = posing;
  const motionInputRef = useRef<HTMLInputElement | null>(null);
  const [motionSource, setMotionSource] = useState<MotionSource | null>(null);
  const robotRig = posing.robot?.rig ?? null;
  const canWalk = !!robotRig && robotRig.joints.some((j) => j.limb === 'leg' || LEG_JOINT.test(j.name));

  const openPose = () => {
    if (!posing.hasRig) return;

    const first = posing.rig.robots[0];

    if (!posing.robot && first) setSelectedIds(robotPartIds(parts, first));

    setMode('pose');
  };

  const walkCycle = () => {
    const robot = posing.robot;

    if (!robot) return;

    const found = detectFeet(robot.rig, posing.pointOf);

    if (!found) {
      showToast('Add leg joints to make a walk cycle');

      return;
    }

    const n = posing.animations.filter((a) => a.name.startsWith('Walk')).length;
    const built = buildGait(
      robot.rig,
      { feet: found.feet, phases: found.phases },
      { values: {} },
      { pointOf: posing.pointOf, name: n ? `Walk ${n + 1}` : 'Walk' },
    );

    if (typeof built === 'string') {
      showToast(built);

      return;
    }

    const made = addAnimation({ ...built.animation, robot: robot.group.key });

    play(made.id, 0);
    showToast(`Added ${made.name}`);
  };

  const importMotion = () => motionInputRef.current?.click();

  const readMotionFile = async (file: File | undefined) => {
    if (file) setMotionSource({ name: file.name, text: await file.text() });
  };

  const createAnimation = (anim: RobotAnimation, summary: string) => {
    setMotionSource(null);

    const made = addAnimation({ ...anim, robot: posing.robot?.group.key });

    openPose();
    play(made.id, 0);
    showToast(summary ? `Added ${made.name}. ${summary}` : `Added ${made.name}`);
  };

  return {
    openPose,
    canWalk,
    walkCycle,
    motionInputRef,
    motionSource,
    closeMotion: () => setMotionSource(null),
    importMotion,
    readMotionFile,
    createAnimation,
  };
}

export type PoseActions = ReturnType<typeof usePoseActions>;
