import { useRef, useState } from 'react';
import type { RobotAnimation } from '../types/robotics';
import { buildGait } from '../utils/animation';
import type { Mocap } from '../utils/mocap';
import { detectFeet } from '../utils/usePosing';
import { robotPartIds } from './selection';
import type { WorkspaceCore } from './useWorkspaceCore';
import { readBvhFile, type MotionDesign } from './useMotionDesign';

const LEG_JOINT = /hip|knee|ankle|leg|haa|kfe/i;

export function usePoseActions(
  { posing, parts, project, setSelectedIds, tool, showToast }: WorkspaceCore,
  design: Pick<MotionDesign, 'openFile'>,
) {
  const { setMode } = tool;
  const { addAnimation, play } = posing;
  const motionInputRef = useRef<HTMLInputElement | null>(null);
  const [motion, setMotion] = useState<Mocap | null>(null);
  const robotRig = posing.robot?.rig ?? null;
  const canWalk = !!robotRig && robotRig.joints.some((j) => j.limb === 'leg' || LEG_JOINT.test(j.name));

  const openPose = () => {
    if (!posing.hasRig && !project.skeleton) return;

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
  };

  const importMotion = () => motionInputRef.current?.click();

  const readMotionFile = async (file: File | undefined) => {
    if (!file) return;

    const read = await readBvhFile(file, showToast);

    if (read) setMotion(read.mocap);
  };

  const importMotionFile = (file: File) => {
    if (posing.hasRig) void readMotionFile(file);
    else design.openFile(file);
  };

  const createAnimation = (anim: RobotAnimation, summary: string) => {
    setMotion(null);

    const made = addAnimation({ ...anim, robot: posing.robot?.group.key });

    openPose();
    play(made.id, 0);

    if (summary) showToast(summary);
  };

  return {
    openPose,
    canWalk,
    walkCycle,
    motionInputRef,
    motion,
    closeMotion: () => setMotion(null),
    importMotion,
    readMotionFile,
    importMotionFile,
    createAnimation,
  };
}

export type PoseActions = ReturnType<typeof usePoseActions>;
