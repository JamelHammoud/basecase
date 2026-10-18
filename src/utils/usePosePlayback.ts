import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ProjectSettings, RobotAnimation, RobotPoseState } from '../types/robotics';
import type { Rig } from './kinematics';
import { animationFrame, findAnimation, storedPose } from './posingHelpers';
import { useLatestRef } from './useLatestRef';

export interface Playback {
  id: string;
  t: number;
  playing: boolean;
}

interface PlaybackOptions {
  projectRef: React.MutableRefObject<ProjectSettings>;
  rigRef: React.RefObject<Rig>;
  animations: RobotAnimation[] | undefined;
  update: (patch: Partial<ProjectSettings>) => void;
  preview: (state: RobotPoseState) => void;
}

const UI_INTERVAL_MS = 66;

export function usePosePlayback({ projectRef, rigRef, animations, update, preview }: PlaybackOptions) {
  const [playback, setPlayback] = useState<Playback | null>(null);
  const playbackRef = useLatestRef(playback);
  const playBase = useRef<RobotPoseState | undefined>(undefined);

  const startPlayback = useEffectEvent(() => {
    if (!playback?.playing) return undefined;

    const anim = findAnimation(projectRef.current, playback.id);

    if (!anim) return undefined;

    const start = performance.now() - playback.t * 1000;
    let raf = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      let t = (now - start) / 1000;
      const done = !anim.loop && t >= anim.duration;

      if (done) t = anim.duration;

      const state = animationFrame(rigRef.current, anim, t, playBase.current);

      preview(state);

      if (done) {
        update({ pose: storedPose(state) });
        setPlayback({ id: anim.id, t, playing: false });

        return;
      }

      if (now - lastUi > UI_INTERVAL_MS) {
        lastUi = now;
        setPlayback((p) => (p && p.playing ? { ...p, t: anim.loop ? t % anim.duration : t } : p));
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  });

  useEffect(() => startPlayback(), [playback?.playing, playback?.id, animations, preview, update]);

  const play = useCallback(
    (id: string, from?: number) => {
      const anim = findAnimation(projectRef.current, id);

      if (!anim) return;

      const cur = playbackRef.current;
      let t = from ?? (cur?.id === id ? cur.t : 0);

      if (!anim.loop && t >= anim.duration - 1e-3) t = 0;

      playBase.current = projectRef.current.pose;
      setPlayback({ id, t, playing: true });
    },
    [projectRef, playbackRef],
  );

  const pause = useCallback(() => {
    const cur = playbackRef.current;

    if (!cur) return;

    const anim = findAnimation(projectRef.current, cur.id);

    setPlayback({ ...cur, playing: false });

    if (!anim) return;

    const state = animationFrame(rigRef.current, anim, cur.t, playBase.current ?? projectRef.current.pose);

    update({ pose: storedPose(state) });
    preview(state);
  }, [playbackRef, projectRef, rigRef, update, preview]);

  const scrub = useCallback(
    (id: string, t: number) => {
      const anim = findAnimation(projectRef.current, id);

      if (!anim) return;

      if (!playbackRef.current?.playing && playbackRef.current?.id !== id) playBase.current = projectRef.current.pose;

      setPlayback({ id, t, playing: false });

      const state = animationFrame(rigRef.current, anim, t, playBase.current ?? projectRef.current.pose);

      update({ pose: storedPose(state) });
      preview(state);
    },
    [playbackRef, projectRef, rigRef, update, preview],
  );

  return { playback, setPlayback, playbackRef, play, pause, scrub };
}
