import { useEffect, useEffectEvent, useRef } from 'react';
import { livePlayer } from '../cases/referencePlayer';
import { robotFacts } from '../cases/robotFit';
import { scaledToReach } from '../cases/scale';
import { worldItem } from '../cases/schema';
import { sceneCamera } from '../datasets/cameras';
import type { DriveCommand } from '../sim/driveTypes';
import type { WorkspaceSeed } from './types';
import type { WorkspaceCore } from './useWorkspaceCore';

interface OpeningCaseOptions {
  seed?: WorkspaceSeed;
  core: WorkspaceCore;
  active: boolean;
}

export function useOpeningCase({ seed, core, active }: OpeningCaseOptions) {
  const caseId = seed?.playCase ?? null;
  const played = useRef(false);

  const play = useEffectEvent(async () => {
    const { sim, cases } = core.simTraining;
    const kase = cases.cases.find((c) => c.id === caseId);

    if (played.current || !kase) return;

    const { parts } = core;
    const { rig } = core.posing;
    const facts = robotFacts(rig, parts);
    const scaled = scaledToReach(kase, facts.reachMm, facts.anchor);

    played.current = true;
    core.tool.setRightTab('sim');
    cases.open(kase.id);
    core.viewportRef.current?.lookThrough(sceneCamera(parts, scaled.world.objects.map(worldItem)));

    const model = (await sim.drive.start()) ? sim.modelNow() : null;

    if (!model) return;

    let command: DriveCommand = { v: [0, 0, 0] };
    let startedAt: number | null = null;
    const player = livePlayer({ kase: scaled, rig, parts, model, send: (next) => (command = next) });

    sim.drive.follow(({ poses, time }) => {
      startedAt ??= time;
      player.tick(time - startedAt, poses);

      return command;
    });
  });

  useEffect(() => {
    if (!caseId || !active) return;

    const soon = setTimeout(() => void play(), 0);

    return () => clearTimeout(soon);
  }, [caseId, active]);
}
