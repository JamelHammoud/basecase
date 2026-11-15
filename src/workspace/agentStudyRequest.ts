import { validateStudyKnobs } from '../study/knobs';
import { boundedInteger } from '../study/recordValues';
import { toScene } from '../agent/agentScene';
import type { Case } from '../cases/schema';
import type { StudyKnob } from '../study/types';
import { caseNamed } from './agentCaseRun';
import { studyReply } from './agentStudyReply';
import type { Cases } from './useCases';
import type { Study } from './useStudy';

type Payload = Record<string, unknown>;

export interface StudyContext {
  cases: Cases;
  study: Pick<Study, 'run'>;
  setAction: (action: string) => void;
}

function legacyKnob(payload: Payload): StudyKnob | undefined {
  if (payload.parameter === 'servo')
    return {
      id: 'servo',
      kind: 'servo',
      joints: (payload.joints ?? []) as string[],
      values: (payload.servos ?? []) as string[],
    };

  if (payload.parameter === 'battery_offset')
    return {
      id: 'battery-offset',
      kind: 'battery_offset',
      values: (payload.offsets_mm ?? []) as Array<[number, number, number]>,
    };

  if (payload.parameter === 'foot_scale')
    return {
      id: 'foot-scale',
      kind: 'foot',
      values: (payload.feet ?? []) as Array<{ length?: number; width?: number }>,
    };

  return undefined;
}

function studyKnobs(payload: Payload): unknown {
  if (payload.knobs !== undefined) return payload.knobs;

  const knob = legacyKnob(payload);

  return knob ? [knob] : undefined;
}

function studyCase(payload: Payload, ctx: StudyContext, explicit: boolean): Case | null | string {
  const wanted = typeof payload.case === 'string' ? payload.case.trim() : '';

  if (!wanted) return explicit ? null : ctx.cases.active;

  return caseNamed(ctx.cases.cases, wanted) ?? `This scene has no Case named ${wanted}.`;
}

export async function studyRequest(payload: Payload, ctx: StudyContext) {
  const asked = studyKnobs(payload);

  if (asked !== undefined && !validateStudyKnobs(asked))
    return { ok: false, problem: 'Choose valid settings and values for the study.' };

  if (payload.cap !== undefined && (!boundedInteger(payload.cap, 64) || payload.cap === 0))
    return { ok: false, problem: 'Try between 1 and 64 designs.' };

  if (payload.seed !== undefined && !boundedInteger(payload.seed, 4294967295))
    return { ok: false, problem: 'Choose a seed from 0 to 4294967295.' };

  const knobs = asked?.map((knob) =>
    knob.kind === 'battery_offset' ? { ...knob, values: knob.values.map(toScene) } : knob,
  );
  const kase = studyCase(payload, ctx, !!knobs);

  if (typeof kase === 'string') return { ok: false, problem: kase };

  ctx.setAction('Studying design options');

  const result = await ctx.study.run({
    kase,
    knobs,
    limit: payload.cap as number | undefined,
    seed: payload.seed as number | undefined,
  });

  return typeof result === 'string' ? { ok: false, problem: result } : studyReply(result, kase);
}
