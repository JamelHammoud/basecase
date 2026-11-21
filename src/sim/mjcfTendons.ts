import type { RobotJoint } from '../types/robotics';
import type { SimJoint } from './mjcfTypes';
import { esc } from './mjcfText';

const number = (value: number) => String(Number(value.toPrecision(12)));

export function tendonMetadata(joint: RobotJoint): Pick<SimJoint, 'tendon'> {
  return joint.tendon ? { tendon: structuredClone(joint.tendon) } : {};
}

export function tendonXml(motors: RobotJoint[], joints: SimJoint[]) {
  const byId = new Map(joints.map((joint) => [joint.id, joint.name]));
  const tendons: string[] = [];
  const equalities: string[] = [];

  for (const motor of motors) {
    if (!motor.tendon) continue;

    const { spool, terms, law } = motor.tendon;
    const name = `t_${byId.get(motor.id)!}`;
    const elastic =
      law.kind === 'elastic'
        ? ` springlength="${number(law.restLengthMm / 1000)}" stiffness="${number(law.stiffnessNPerMm * 1000)}" damping="${number(law.dampingNsPerMm * 1000)}"`
        : '';
    const coordinates = [
      `<joint joint="${esc(byId.get(motor.id)!)}" coef="${number(spool.coefficient / 1000)}"/>`,
      ...terms.map(
        (term) =>
          `<joint joint="${esc(byId.get(term.joint)!)}" coef="${number(term.coefficient / (term.unit === 'mm/rad' ? 1000 : 1))}"/>`,
      ),
    ];

    tendons.push(`    <fixed name="${esc(name)}"${elastic}>${coordinates.join('')}</fixed>`);

    if (law.kind === 'fixed')
      equalities.push(
        `    <tendon tendon1="${esc(name)}" polycoef="${number(law.lengthMm / 1000)} 0 0 0 0" solref="0.004 1" solimp="0.9999 0.9999 0.001 0.5 2"/>`,
      );
  }

  return { tendons, equalities };
}
