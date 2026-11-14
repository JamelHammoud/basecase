import React from 'react';
import { Select, Switch } from '../../design-system';
import { CURRENCY_CODES, createMoney } from '../../utils/currency';
import { setCurrency } from '../../utils/currencyStore';
import { dayLabel } from '../../utils/timeAgo';
import { useMoney } from '../../utils/useMoney';
import { SettingsGroup as Group, SettingsRow as Row } from '../SettingsRows';

export interface BuildPrefs {
  autoGuide: boolean;
  setAutoGuide: (v: boolean) => void;
  autoFixBlockers: boolean;
  setAutoFixBlockers: (v: boolean) => void;
}

const CURRENCIES = CURRENCY_CODES.map((code) => {
  const m = createMoney(code);

  return { value: code, label: m.symbol === code ? `${m.name} (${code})` : `${m.name} (${m.symbol})` };
}).sort((a, b) => a.label.localeCompare(b.label));

const PricesGroup: React.FC = () => {
  const money = useMoney();

  return (
    <Group title="Prices">
      <Row
        label="Currency"
        hint={
          money.code === 'USD'
            ? undefined
            : `Converted from US dollars at European Central Bank rates, ${dayLabel(money.ratesDate)}`
        }
      >
        <div className="w-[240px]">
          <Select
            value={money.code}
            onChange={(e) => setCurrency(e.target.value)}
            options={CURRENCIES}
            aria-label="Currency"
          />
        </div>
      </Row>
    </Group>
  );
};

export const BuildPane: React.FC<{ prefs: BuildPrefs }> = ({ prefs }) => (
  <>
    <Group title="Checks">
      <Row label="Have the agent fix new blockers" hint="Up to 2 follow-ups per message">
        <Switch
          aria-label="Have the agent fix new blockers"
          checked={prefs.autoFixBlockers}
          onChange={prefs.setAutoFixBlockers}
        />
      </Row>
    </Group>
    <PricesGroup />
    <Group title="Build guide">
      <Row label="Update automatically" hint="15 s after the scene changes, once the agent is done">
        <Switch aria-label="Update automatically" checked={prefs.autoGuide} onChange={prefs.setAutoGuide} />
      </Row>
    </Group>
  </>
);
