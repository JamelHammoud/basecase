import { Section, Switch } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';
import type { Rig } from '../../utils/kinematics';

export function SelfContactSection({ sim, rig }: { sim: Simulation; rig: Rig }) {
  if (!rig.robots.length) return null;

  return (
    <Section title="Self-contact" collapsible>
      {rig.robots.map((robot) => (
        <Switch
          key={robot.key}
          label={robot.name}
          aria-label={`Self-contact for ${robot.name}`}
          checked={sim.selfContact[robot.key]?.enabled ?? false}
          onChange={(enabled) => sim.configureSelfContact(robot.key, { ...sim.selfContact[robot.key], enabled })}
        />
      ))}
    </Section>
  );
}
