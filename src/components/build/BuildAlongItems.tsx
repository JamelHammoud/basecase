import type { BuildAlongStep } from '../../guide/buildAlong';
import { SUPPLY_BY_ID } from '../../data/supplies';
import { lengthLabel } from '../../utils/size';

const chip = 'glass rounded-full h-[28px] px-3.5 flex items-center text-[13px] text-white/90 tabular-nums whitespace-nowrap';

export function BuildAlongItems({ step }: { step: BuildAlongStep | null }) {
  if (!step || (step.callout.length === 0 && step.tools.length === 0 && step.routes.length === 0)) return null;

  return (
    <ul className="flex flex-wrap justify-center gap-2 max-w-[720px]">
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
