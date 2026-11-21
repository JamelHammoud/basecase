import type { BuildAlongStep } from '../../guide/buildAlong';
import { SUPPLY_BY_ID } from '../../data/supplies';
import { lengthLabel } from '../../utils/size';

const chip =
  'glass rounded-full min-h-[28px] max-w-full min-w-0 px-3.5 py-1 flex items-center text-[13px] text-white/90 tabular-nums whitespace-normal wrap-anywhere';

export function BuildAlongItems({ step }: { step: BuildAlongStep | null }) {
  if (!step || (!step.repairPhase && step.callout.length === 0 && step.tools.length === 0 && step.routes.length === 0)) return null;

  return (
    <ul className="flex flex-wrap justify-center gap-2 w-full max-w-[720px]">
      {step.repairPhase && <li className={chip}>{step.action ? { disconnect: 'Disconnect', connect: 'Connect', joint: 'Check Joints' }[step.action] : { remove: 'Remove', swap: 'Replace', reassemble: 'Reassemble' }[step.repairPhase]}</li>}
      {step.callout.map((item) => (
        <li key={`${item.qty}|${item.name}`} className={chip}>
          {item.qty} × {item.name}
        </li>
      ))}
      {step.tools.map((tool) => (
        <li key={tool} className={chip}>
          {tool}
        </li>
      ))}
      {step.routes.map((net) => (
        <li
          key={`${net.from.id}:${net.from.port?.name}:${net.to.id}:${net.to.port?.name}`}
          className={`${chip} gap-3`}
          data-build-route
        >
          <span>{net.from.name} to {net.to.name}</span>
          {net.route?.cableSupplyId && (
            <span className="text-white/60">{SUPPLY_BY_ID[net.route.cableSupplyId]?.name}</span>
          )}
          {net.route?.lengthMm != null && <span>{lengthLabel(net.route.lengthMm)}</span>}
        </li>
      ))}
    </ul>
  );
}
