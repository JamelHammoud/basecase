import React from 'react';
import { NumberInput, Switch, TextInput } from '../../design-system';
import type { StudioDraft } from './useStudioDraft';

const DRAW_COLORS = ['#e4e4e7', '#3f3f46', '#f97316', '#0d99ff', '#22c55e'];

export const OutputFields: React.FC<{ draft: StudioDraft; spanLabel: string; revolve: boolean }> = ({
  draft,
  spanLabel,
  revolve,
}) => (
  <>
    <TextInput
      value={draft.drawName}
      onChange={(e) => draft.setDrawName(e.target.value)}
      placeholder="Name"
      aria-label="Name"
    />
    <div className="grid grid-cols-2 gap-2">
      <NumberInput
        label="W"
        title={spanLabel}
        value={draft.drawSpanMm}
        min={5}
        max={500}
        precision={0}
        onChange={(v) => draft.setDrawSpanMm(v)}
      />
      <NumberInput
        label="T"
        title={revolve ? 'Height' : 'Thickness'}
        value={draft.drawHeightMm}
        min={1}
        max={250}
        precision={1}
        onChange={(v) => draft.setDrawHeightMm(v)}
      />
    </div>
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {DRAW_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            onClick={() => draft.setDrawColor(c)}
            className={`w-5 h-5 rounded-full ring-1 ring-inset ring-white/20 cursor-default transition-transform ${
              draft.drawColor === c ? 'outline-2 outline-offset-2 outline-[#0d99ff]' : 'hover:scale-110'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      {!revolve && <Switch label="Bevel" checked={draft.drawBevel} onChange={draft.setDrawBevel} />}
    </div>
  </>
);
