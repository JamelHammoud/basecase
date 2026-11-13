import { useRef, useState, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Case } from '../cases/schema';
import { hubBridge } from '../hub/hubBridge';
import type { Simulation } from '../sim/useSimulation';
import type { Training } from '../sim/useTraining';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { publishSharedRobot, sharedRobotBundle, storedSkill } from './shareRobot';
import type { ShowToast } from './types';
import type { SceneSkills } from './useSkills';
import { errorMessage } from '../utils/errorMessage';

interface ShareRobotOptions {
  scene: { sceneId: string; sceneName: string };
  parts: ScenePart[];
  project: ProjectSettings;
  kase: Case | null;
  hasRobot: boolean;
  sim: Simulation;
  training: Training;
  skills: SceneSkills;
  viewportRef: RefObject<Viewport3DHandle | null>;
  showToast: ShowToast;
  openAccounts: () => void;
}

export interface ShareRobot {
  canShare: boolean;
  sharing: boolean;
  link: string | null;
  share: () => void;
}

export function useShareRobot(options: ShareRobotOptions): ShareRobot {
  const { scene, parts, project, kase, sim, training, skills, viewportRef, showToast, openAccounts } = options;
  const [sharing, setSharing] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const busy = useRef(false);
  const canShare = !IS_WEB_DEMO && options.hasRobot && !!kase;

  const publish = async () => {
    const bundle = await sharedRobotBundle({
      ...scene,
      parts,
      project,
      kase,
      model: async () => sim.model ?? (await sim.buildModel()),
      triangles: (id) => viewportRef.current?.partTriangles(id) ?? null,
      meshesReady: async () => viewportRef.current?.meshesReady(),
      policies: { load: training.loadPolicy, isStale: training.isStale },
      skillRows: skills.rows,
      loadSkill: storedSkill,
    });
    const copied = await publishSharedRobot(bundle);

    await navigator.clipboard.writeText(copied);
    setLink(copied);
    showToast('Link copied');
  };

  const share = async () => {
    if (!(await hubBridge.signedIn())) {
      openAccounts();

      return;
    }

    setSharing(true);

    try {
      await publish();
    } catch (err) {
      showToast(`Couldn’t share the robot. ${errorMessage(err)}`, { tone: 'error' });
    } finally {
      setSharing(false);
    }
  };

  return {
    canShare,
    sharing,
    link,
    share: () => {
      if (!canShare || busy.current) return;

      busy.current = true;
      void share().finally(() => {
        busy.current = false;
      });
    },
  };
}
