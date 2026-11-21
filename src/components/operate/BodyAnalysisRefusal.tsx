import type { BodyAnalysisRefusal as Refusal } from '../../reality/bodyAnalysisTypes';
import { BODY_EMULATOR_LIMIT } from '../../reality/bodyExperimentTypes';

const messages: Partial<Record<Refusal, string>> = {
  backend: BODY_EMULATOR_LIMIT,
  unsupported: 'Position-actuated joints only.',
  units: 'Joint units don’t match.',
};

export function BodyAnalysisRefusal({ reason }: { reason?: Refusal }) {
  return <p className="text-[13px] text-white/60">{(reason && messages[reason]) || 'Can’t tell.'}</p>;
}
