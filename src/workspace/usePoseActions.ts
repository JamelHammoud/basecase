import { useRef, useState } from 'react';
import type { RobotAnimation } from '../types/robotics';
import { buildGait } from '../utils/animation';
import { parseBvh, type Mocap } from '../utils/mocap';
import { detectFeet } from '../utils/usePosing';
import { robotPartIds } from './selection';
import type { WorkspaceCore } from './useWorkspaceCore';
import { errorMessage } from '../utils/errorMessage';
import { useMotionDesign } from './useMotionDesign';

const LEG_JOINT = /hip|knee|ankle|leg|haa|kfe/i;

export function usePoseActions(core: WorkspaceCore) {
  const { posing, parts, project, setSelectedIds, tool, showToast } = core;
  const { setMode } = tool;
  const { addAnimation, play } = posing;
  const motionInputRef = useRef<HTMLInputElement | null>(null);
  const [motion, setMotion] = useState<Mocap | null>(null);
  const design = useMotionDesign(core);
  const designInputRef = useRef(false);
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

  const importMotion = () => {
    designInputRef.current = false;
    motionInputRef.current?.click();
  };

  const designFromMotion = () => {
    designInputRef.current = true;
    motionInputRef.current?.click();
  };

  const readMotionFile = async (file: File | undefined) => {
    if (!file) return;

    const designing = designInputRef.current || !posing.hasRig;

    designInputRef.current = false;

    const text = await file.text();
    const name = file.name.replace(/\.bvh$/i, '');

    if (designing) {
      design.open({ text, name });

      return;
    }

    try {
      setMotion(parseBvh(text, name));
    } catch (err) {
      showToast(`Couldn’t read ${file.name}. ${errorMessage(err)}`, { tone: 'error' });
    }
  };

  const importMotionFile = (file: File) => {
    designInputRef.current = false;
    void readMotionFile(file);
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
    design,
    designFromMotion,
    closeMotion: () => setMotion(null),
    importMotion,
    readMotionFile,
    importMotionFile,
    createAnimation,
  };
}

export type PoseActions = ReturnType<typeof usePoseActions>;
