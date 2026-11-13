import React from 'react';
import { DisclosureRow, Tooltip } from '../../design-system';
import { useMoney } from '../../utils/useMoney';
import type { BomGroup } from './buyLine';
import { CheckIcon } from './CheckIcon';
import { BuyRow, type BuyContext } from './BuyRow';

const Subtotal: React.FC<{ group: BomGroup }> = ({ group }) => {
  const money = useMoney();

  if (group.usd === undefined) return null;

  return (
    <Tooltip label="Left out of the budget" disabled={group.category !== 'Equipment'} className="shrink-0">
      <span className="pr-1.5 text-[13px] leading-[18px] text-white/60 tabular-nums">
        {group.estimated && '≈ '}
        {money.format(group.usd)}
      </span>
    </Tooltip>
  );
};

export const BuyGroup: React.FC<{ group: BomGroup; open: boolean; onToggle: () => void; context: BuyContext }> = ({
  group,
  open,
  onToggle,
  context,
}) => {
  return (
    <li>
      <DisclosureRow open={open} onToggle={onToggle}>
        <span className="min-w-0 flex-1 flex items-start gap-1.5">
          <span className="min-w-0 text-[13px] leading-[18px] text-white/90">{group.category}</span>
          <span className="text-[12px] leading-[18px] text-white/50 tabular-nums">{group.lines.length}</span>
          {group.attention && <CheckIcon status="warn" />}
        </span>
        <Subtotal group={group} />
      </DisclosureRow>
      {open && (
        <ul className="pb-1">
          {group.lines.map((line) => (
            <BuyRow key={line.key} line={line} context={context} />
          ))}
        </ul>
      )}
    </li>
  );
};
