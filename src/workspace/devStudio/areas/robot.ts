import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import type { Viewport3DHandle } from '../../../components/Viewport3D';
import type { Angles } from '../../../robot/robotGap';
import { robotLinkState, startRobotStore, type RobotLinkApi } from '../../../robot/robotStore';
import { twinSnapshot } from '../../../robot/robotTwin';
import { radiansToDegrees as degrees } from '../../../utils/angle';
import { importRobot } from '../../../utils/robotImport';
import { robotPreviewImage } from '../../../utils/robotPreview';
import { robotPackageZip } from '../../robotPackageExport';
import { base64Files } from '../base64Files';
import type { Studio, StudioContext } from '../types';

function robotGhostState(viewport: Viewport3DHandle | null) {
  const twin = twinSnapshot();
  const byJoint = (angles: Angles | null | undefined) =>
    twin && angles
      ? Object.fromEntries(twin.joints.map((id, k) => [id, angles[k] === null ? null : degrees(angles[k])]))
      : null;

  return {
    layer: viewport?.ghostState() ?? null,
    measured: byJoint(twin?.measured),
    sim: byJoint(twin?.sim),
    gaps: byJoint(twin?.gaps),
    largest: twin?.largest ? { joint: twin.largest.joint, degrees: degrees(twin.largest.gap) } : null,
  };
}

async function robotPackage({ core }: StudioContext) {
  const made = await robotPackageZip(core);

  return (
    made && {
      files: base64Files(unzipSync(made.zip)),
      simXml: (await core.simTraining.sim.buildModel()).xml,
    }
  );
}

export default function robotStudio(studio: Studio) {
  return {
    importRobot: (url: string, name?: string) => studio().actions.robots.importRobotFrom({ kind: 'url', url, name }),
    robotPreview: async (url: string, width = 480) =>
      robotPreviewImage((await importRobot({ kind: 'url', url })).parts, width),
    robotPackage: () => robotPackage(studio()),
    attachRobot: (link: RobotLinkApi) => startRobotStore(link),
    robotCalibration: async () => (await robotLinkState())?.calibration ?? null,
    robotGhost: () => robotGhostState(studio().core.viewportRef.current),
  };
}
