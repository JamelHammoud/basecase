import React from 'react';
import { Select } from '../../design-system';
import { CURRENCY_CODES, createMoney } from '../../utils/currency';
import { setCurrency } from '../../utils/currencyStore';
import { useMoney } from '../../utils/useMoney';
import { SettingsGroup as Group, SettingsRow as Row } from '../SettingsRows';

const OPTIONS = CURRENCY_CODES.map((code) => {
  const m = createMoney(code);

  return { value: code, label: m.symbol === code ? `${m.name} (${code})` : `${m.name} (${m.symbol})` };
}).sort((a, b) => a.label.localeCompare(b.label));

const ratesDay = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const RegionPane: React.FC = () => {
  const money = useMoney();

  return (
    <Group title="Prices">
      <Row
        label="Currency"
        hint={
          money.code === 'USD'
            ? undefined
            : `Converted from US dollars at European Central Bank rates, ${ratesDay(money.ratesDate)}`
        }
      >
        <div className="w-[240px]">
          <Select value={money.code} onChange={(e) => setCurrency(e.target.value)} options={OPTIONS} />
        </div>
      </Row>
    </Group>
  );
};
