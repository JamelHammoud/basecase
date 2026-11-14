import { rollOutSnapshot, stubTwins } from '../../../fleet/rollOutStore';
import type { TwinVerdict } from '../../../fleet/twinArena';
import { emulatedSpec } from '../../../robot/emulatedUnits';
import { connectRobot, fleetSnapshot, rollBackUnit, selectUnit } from '../../../robot/robotStore';
import { sceneRobot } from '../../../robot/sceneRobot';
import type { SkillRecord } from '../../../skills/skillRecords';
import { withRecord } from '../../../skills/skillRecords';
import type { Skill } from '../../../skills/artifacts';
import { platformBridge } from '../../../utils/platformBridge';
import type { Studio } from '../types';

async function connectUnit(studio: Studio, unit: string) {
  const { core } = studio();
  const joints = core.project.joints ?? [];
  const robot = sceneRobot(joints);

  if (!robot.ok) return { ok: false, message: robot.reason };

  return connectRobot(emulatedSpec({ choice: robot, joints, parts: core.parts }), robot.joints, unit);
}

const fleetRows = () => {
  const fleet = fleetSnapshot();

  return {
    selected: fleet.selected,
    units: fleet.units.map((u) => ({
      unit: u.unit,
      link: u.state.link,
      mode: u.state.mode,
      run: u.state.status?.run ?? null,
      faultLatched: u.state.status?.fault_latched ?? false,
      version: u.version,
      previous: u.previous,
    })),
  };
};

export default function fleetStudio(studio: Studio) {
  return {
    connectUnit: (unit: string) => connectUnit(studio, unit),
    fleet: fleetRows,
    selectUnit,
    fleetModel: () => studio().core.simTraining.skills.buildModel(),
    seedFleetSkill: async (record: SkillRecord, skill?: Skill) => {
      if (skill) await platformBridge.saveSkill({ hash: record.hash, text: JSON.stringify(skill) });

      studio().core.docs.setProject((project) => ({ ...project, skills: withRecord(project.skills ?? [], record) }));
    },
    stubFleetTwins: (twins: Record<string, TwinVerdict> | null) => stubTwins(twins),
    rollOutState: rollOutSnapshot,
    rollBackUnit,
  };
}
