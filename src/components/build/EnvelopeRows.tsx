import React, { useState } from 'react';
import { DisclosureRow, MetaLine, TracePlot, type Trace } from '../../design-system';
import type { ReadinessFinding } from '../../readiness/types';
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
  <>
    <span className={`inline-block align-middle w-3 h-0.5 mr-1.5 rounded-full ${className}`} />
    {name}
  </>
);

const EnvelopePlot: React.FC<{ envelope: JointEnvelope }> = ({ envelope }) => (
  <div data-joint={envelope.joint} className="pt-1.5 flex flex-col gap-1.5">
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
);

export const FindingPlot: React.FC<{ finding: ReadinessFinding; envelopes?: JointEnvelope[] }> = ({
  finding,
  envelopes,
}) => {
  const envelope = finding.joint ? envelopes?.find((e) => e.joint === finding.joint) : undefined;

  return envelope ? <EnvelopePlot envelope={envelope} /> : null;
};

export function unlisted(envelopes: JointEnvelope[], findings: ReadinessFinding[]): JointEnvelope[] {
  const listed = new Set(findings.map((f) => f.joint));

  return envelopes.filter((e) => !listed.has(e.joint));
}

const EnvelopeRow: React.FC<{ envelope: JointEnvelope }> = ({ envelope }) => {
  const [open, setOpen] = useState(false);

  return (
    <li>
      <DisclosureRow open={open} onToggle={() => setOpen((v) => !v)} className="pl-[31px] pr-[7px]">
        <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-white/90">{envelope.label}</span>
      </DisclosureRow>
      {open && (
        <div className="pl-[31px] pr-[7px] pb-1.5">
          <EnvelopePlot envelope={envelope} />
        </div>
      )}
    </li>
  );
};

export const EnvelopeRows: React.FC<{ envelopes: JointEnvelope[] }> = ({ envelopes }) =>
  envelopes.length ? (
    <ul>
      {envelopes.map((e) => (
        <EnvelopeRow key={e.joint} envelope={e} />
      ))}
    </ul>
  ) : null;
