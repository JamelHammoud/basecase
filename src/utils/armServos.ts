import { componentSize } from '../data/components';
import { actuatorOptions, type ActuatorOption } from './actuatorCatalog';

export const ARM_LINK_SERVO = 'feetech-sts3215';

const CASE_TOLERANCE_MM = 0.5;

const componentOf = (key: string) => key.split('|')[0].replace(/^component:/, '');

function sameCase(id: string): boolean {
  const a = componentSize(ARM_LINK_SERVO);
  const b = componentSize(id);

  return [a.width - b.width, a.height - b.height, a.depth - b.depth].every((d) => Math.abs(d) <= CASE_TOLERANCE_MM);
}

export function armServoOptions(options: ActuatorOption[] = actuatorOptions()): ActuatorOption[] {
  return options.filter((o) => o.bus === 'feetech' && sameCase(componentOf(o.key)));
}
