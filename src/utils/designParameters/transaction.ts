import { rewriteDimensions } from '../../../electron/cad-kernel/dimensions.mjs';
import { eachLimited } from '../../../electron/eachLimited.mjs';
import { tunedCad } from '../../agent/cadTune';
import type { AgentCadPayload } from '../../agent/cadMesh';
import type { ScenePart } from '../../types/robotics';
import type { RenderedCad } from '../platform/types';
import { isCompiled } from '../platform/cadResult';
import { errorMessage } from '../errorMessage';
import { editWithOperands } from '../../booleans/operands';
import type { ParameterDesign } from './mutations';
import { planParameterEdit, type ParameterPartPlan } from './plan';
import { parameterGeometryScope } from './scope';

export interface ParameterGeometryJob {
  force?: string[];
  verify?: boolean;
  parts: ScenePart[];
  plans: ParameterPartPlan[];
  cad: Array<{ id: string; payload: AgentCadPayload }>;
}

export interface ParameterServices {
  force?: string[];
  verify?: boolean;
  compile: (part: ScenePart, code: string) => Promise<RenderedCad>;
  regenerate: (job: ParameterGeometryJob) => Promise<ScenePart[]>;
  isCurrent: () => boolean;
  signal?: AbortSignal;
}

function assertCurrent(services: ParameterServices) {
  if (services.signal?.aborted) throw new Error('Dimension edit cancelled.');

  if (!services.isCurrent()) throw new Error('The design changed during dimension preparation.');
}

async function interruptible<T>(pending: Promise<T>, services: ParameterServices): Promise<T> {
  const signal = services.signal;
  const checked = pending.then((value) => {
    assertCurrent(services);

    return value;
  });

  if (!signal) return checked;

  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new Error('Dimension edit cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
  });

  if (signal.aborted) abort();

  return Promise.race([checked, cancelled]).finally(() => signal.removeEventListener('abort', abort));
}

async function compilePlan(plan: ParameterPartPlan, services: ParameterServices) {
  assertCurrent(services);

  const part = plan.part;
  const source = part.cad!;
  const code = rewriteDimensions(source.code, plan.values);

  if (code === source.code && !services.verify && !services.force?.includes(part.id)) return null;

  try {
    const rendered = await services.compile(part, code);

    assertCurrent(services);

    const tuned = tunedCad({ code, result: { ...rendered } }, source.expect);

    if ('error' in tuned) throw new Error(tuned.error);

    if (!isCompiled(rendered)) throw new Error('The CAD kernel returned no solid geometry.');

    return { id: part.id, payload: tuned.cad };
  } catch (error) {
    assertCurrent(services);

    throw new Error(`${part.name} (${part.id}): ${errorMessage(error)}`, { cause: error });
  }
}

async function compilePlans(plans: ParameterPartPlan[], services: ParameterServices) {
  const results: Array<Awaited<ReturnType<typeof compilePlan>>> = new Array(plans.length).fill(null);
  let failed = false;

  await eachLimited(plans, 4, async (plan: ParameterPartPlan, index: number) => {
    if (failed) return;

    try {
      results[index] = await compilePlan(plan, services);
    } catch (error) {
      failed = true;

      throw error;
    }
  });

  return results;
}

export async function prepareParameterEdit(design: ParameterDesign, services: ParameterServices) {
  const started = performance.now();

  assertCurrent(services);

  const plans = planParameterEdit(design.parts, design.parameters);
  const compiled = await interruptible(
    compilePlans(
      plans.filter((plan) => plan.kind === 'cad'),
      services,
    ),
    services,
  );

  assertCurrent(services);

  const cad = compiled.filter((result) => result !== null);
  const scope = parameterGeometryScope({
    parts: design.parts,
    plans,
    cad,
    verify: services.verify,
    force: services.force,
  });
  const updated = scope.parts.length ? await interruptible(services.regenerate(scope), services) : [];

  assertCurrent(services);

  const patches = new Map(updated.map((part) => [part.id, part]));
  const parts = editWithOperands(design.parts, (flat) => flat.map((part) => patches.get(part.id) ?? part));

  return {
    parts,
    parameters: design.parameters,
    metrics: {
      elapsedMs: performance.now() - started,
      compiled: cad.length,
      retained: parts.filter((part, index) => part === design.parts[index]).length,
    },
  };
}
