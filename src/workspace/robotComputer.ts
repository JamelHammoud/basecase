import { openRobotComputer } from '../robot/robotComputer';
import { emulatedSpec } from '../robot/emulatedUnits';
import type { RobotComputerAsk, RobotInstallReply } from '../robot/networkTypes';
import { connectNetworkRobot } from '../robot/robotStore';
import { isServoAsk } from '../robot/robotState';
import { sceneRobot, type ConnectChoice } from '../robot/sceneRobot';
import type { JointMap } from '../sim/robotPackage/jointMap';
import { exportRobotJointMap } from '../sim/robotPackage/robotPackageClient';
import { electron, post } from '../utils/platform/transport';
import { robotJointMapJob } from './robotPackageExport';
import type { WorkspaceCore } from './useWorkspaceCore';

function installationChoice(choice: ConnectChoice, map: JointMap): ConnectChoice {
  const families = [...new Set(map.joints.map((joint) => joint.family).filter((family) => family !== null))];

  if (!isServoAsk(choice.spec) || families.length !== 1) return choice;

  return { ...choice, spec: { ...choice.spec, family: families[0] } };
}

async function installComputer(core: WorkspaceCore, fields: RobotComputerAsk): Promise<RobotInstallReply> {
  const job = await robotJointMapJob(core);
  const choice = sceneRobot(core.project.joints ?? []);

  if (!job || !choice.ok) return { ok: false, message: 'Insert a robot with joints first.' };

  const jointMap = await exportRobotJointMap(job);
  const ask = {
    target: `${fields.user.trim()}@${fields.host.trim()}`,
    jointMap: { ...jointMap },
    emulated: true as const,
    spec: emulatedSpec({
      choice: installationChoice(choice, jointMap),
      joints: core.project.joints ?? [],
      parts: core.parts,
    }),
    ...(fields.key.trim() ? { key: fields.key.trim() } : {}),
  };
  const api = electron();
  const reply: RobotInstallReply = api?.robotInstall ? await api.robotInstall(ask) : await post('/robot-install', ask);

  if (!reply.ok) return reply;

  const connected = await connectNetworkRobot(
    { host: reply.host, port: reply.port, ...(reply.pairingCode ? { code: reply.pairingCode } : {}) },
    choice.joints,
    ask.spec,
  );

  return connected.ok ? reply : connected;
}

export const addRobotComputer = (core: WorkspaceCore) => openRobotComputer((fields) => installComputer(core, fields));
