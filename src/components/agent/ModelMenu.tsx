import React, { useRef, useState } from 'react';
import type { AcpStatusInfo, AgentChoice, AgentModel, ContextUsage, EffortLevel } from '../../types/robotics';
import { Button, MenuDivider, MenuItem, PopoverMenu, Slider, ChevronDownIcon } from '../../design-system';
import { ContextStatus } from './ContextStatus';

const fallbackEffort = (levels: EffortLevel[]) => levels.find((l) => l.id === 'medium') ?? levels[0];

function effortIndex(levels: EffortLevel[], wanted: string | undefined, defaultEffort: string | undefined) {
  const chosen = levels.findIndex((l) => l.id === wanted);

  if (chosen >= 0) return chosen;

  const inherited = levels.findIndex((l) => l.id === defaultEffort);

  return inherited >= 0 ? inherited : levels.indexOf(fallbackEffort(levels));
}

const EffortSlider: React.FC<{
  levels: EffortLevel[];
  choice: AgentChoice;
  defaultEffort?: string;
  onChange: (choice: AgentChoice) => void;
}> = ({ levels, choice, defaultEffort, onChange }) => {
  const index = effortIndex(levels, choice.effort, defaultEffort);
  const resetIndex = effortIndex(levels, defaultEffort, defaultEffort);

  return (
    <div className="px-2.5 pt-1 pb-1.5">
      <Slider
        stacked
        label="Effort"
        min={0}
        max={levels.length - 1}
        value={index}
        defaultValue={resetIndex}
        format={(i) => levels[i]?.name ?? ''}
        onChange={(i) => onChange({ ...choice, effort: levels[i]?.id })}
      />
    </div>
  );
};

const selectedModel = (models: AgentModel[], ids: Array<string | undefined>) =>
  ids.map((id) => models.find((m) => m.id === id)).find(Boolean) ?? models[0];

export const ModelMenu: React.FC<{
  agent: AcpStatusInfo;
  context: ContextUsage | null;
  choice: AgentChoice;
  onChange: (choice: AgentChoice) => void;
}> = ({ agent, context, choice, onChange }) => {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const models = agent.models ?? [];

  if (!models.length) return null;

  const selected = selectedModel(models, [choice.model, agent.defaultModel]);
  const levels = selected.effortLevels ?? [];

  return (
    <div className="relative min-w-0" ref={anchorRef}>
      <Button
        variant="ghost"
        title="Model"
        tooltipSide="top"
        aria-label={`Model: ${selected.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded-full px-2.5 max-w-full ${open ? 'bg-white/[0.06] text-white/90' : ''}`}
        iconRight={<ChevronDownIcon className="w-3.5 h-3.5" />}
        onClick={() => setOpen((v) => !v)}
      >
        {selected.name}
      </Button>
      <PopoverMenu isOpen={open} onClose={() => setOpen(false)} ignoreRef={anchorRef} align="end" className="w-64">
        {models.map((m) => (
          <MenuItem
            key={m.id}
            label={m.name}
            detail={m.resolvesTo}
            checked={m.id === selected.id}
            onSelect={() => onChange({ ...choice, model: m.id })}
          />
        ))}
        {levels.length > 1 && (
          <>
            <MenuDivider />
            <EffortSlider levels={levels} choice={choice} defaultEffort={agent.defaultEffort} onChange={onChange} />
          </>
        )}
        {context && (
          <>
            <MenuDivider />
            <ContextStatus context={context} />
          </>
        )}
      </PopoverMenu>
    </div>
  );
};
