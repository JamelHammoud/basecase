import React, { useState } from 'react';
import { ChevronDownIcon, MetaLine, TracePlot, type Trace } from '../../design-system';
import type { JointEnvelope, ServoCurve } from '../../utils/engineeringTypes';
import { isMotoring } from '../../utils/peakTorque';

const PLOT = 128;

const curveTrace = (id: string, curve: ServoCurve, tone: Trace['tone']): Trace => ({
  id,
  x: [0, curve.rpm],
  values: [curve.stallNm, 0],
  tone,
});

function pointsTrace(id: string, samples: JointEnvelope['samples'], tone: Trace['tone']): Trace {
  return {
    id,
    x: samples.map(([rpm]) => Math.abs(rpm)),
    values: samples.map(([, nm]) => Math.abs(nm)),
    tone,
    points: true,
  };
}

export function envelopeTraces(e: JointEnvelope): Trace[] {
  return [
    ...(e.up ? [curveTrace('up', e.up, 'muted')] : []),
    pointsTrace(
      'braking',
      e.samples.filter((s) => !isMotoring(s)),
      'muted',
    ),
    pointsTrace('driving', e.samples.filter(isMotoring), 'primary'),
    curveTrace('servo', e.servo, 'accent'),
  ];
}

const Swatch: React.FC<{ className: string; name: string }> = ({ className, name }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={`w-3 h-0.5 rounded-full shrink-0 ${className}`} />
    {name}
  </span>
);

const EnvelopeRow: React.FC<{ envelope: JointEnvelope }> = ({ envelope }) => {
  const [open, setOpen] = useState(false);
  const share = Math.round(envelope.outside * 100);

  return (
    <li data-joint={envelope.joint}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2 py-1.5 pl-[31px] pr-[7px] rounded-lg text-left cursor-default hover:bg-white/[0.04]"
      >
        <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-white/85">{envelope.label}</span>
        {share > 0 && <span className="text-[12px] leading-[18px] text-white/50 tabular">{share}%</span>}
        <span className="h-[18px] flex items-center shrink-0">
          <ChevronDownIcon
            className={`w-3.5 h-3.5 text-white/50 transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
          />
        </span>
      </button>
      {open && (
        <div className="pl-[31px] pr-[7px] pb-1.5 flex flex-col gap-1.5">
          <TracePlot
            traces={envelopeTraces(envelope)}
            height={PLOT}
            limit={envelope.servo.ratedNm}
            fromZero
            units={{ x: 'rpm', y: 'N·m' }}
          />
          <MetaLine
            className="text-[12px] leading-4 text-white/50"
            items={[
              <Swatch key="servo" className="bg-[#0d99ff]" name={envelope.servo.name} />,
              envelope.up && <Swatch key="up" className="bg-white/35" name={envelope.up.name} />,
            ]}
          />
        </div>
      )}
    </li>
  );
};

export const EnvelopeRows: React.FC<{ envelopes: JointEnvelope[] }> = ({ envelopes }) => (
  <ul>
    {envelopes.map((e) => (
      <EnvelopeRow key={e.joint} envelope={e} />
    ))}
  </ul>
);
