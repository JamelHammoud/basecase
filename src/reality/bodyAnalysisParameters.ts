import type { BodyAnalysisParameter, BodyAnalysisRequest } from './bodyAnalysisTypes';
import { bodyParameters, emptyBodyFit } from './bodyParameters';

export function physicalParameters(request: BodyAnalysisRequest): BodyAnalysisParameter[] {
  return bodyParameters(request.model, request.robot).map((parameter) => {
    const body = request.model.bodies.find((candidate) => candidate.name === parameter.name);
    const label =
      request.model.joints.find((joint) => joint.id === body?.joint)?.name ??
      request.model.robots.find((robot) => robot.key === request.robot)!.name;
    const payload = parameter.kind === 'payloadKg';
    const fit = request.nominal ?? emptyBodyFit();
    const nominal =
      parameter.kind === 'floorFrictionScale'
        ? fit.floorFrictionScale
        : (fit[parameter.kind][parameter.name] ?? (payload ? 0 : 1));
    const step = payload ? 0.0001 : 0.001;
    const bounds: [number, number] = payload
      ? [parameter.lower * 0.1, parameter.upper * 0.1]
      : [Math.exp(parameter.lower), Math.exp(parameter.upper)];

    return {
      body: parameter.name,
      label,
      kind: parameter.kind,
      unit: payload ? 'kg' : 'scale',
      nominal,
      bounds,
      probe: [Math.max(bounds[0], nominal - step), Math.min(bounds[1], nominal + step)],
      scale: payload ? 0.1 : 0.25,
      response: 0,
      distinguishability: 'poor-excitation',
    };
  });
}

export function changedFit(input: { request: BodyAnalysisRequest; parameter: BodyAnalysisParameter; value: number }) {
  const { request, parameter, value } = input;
  const fit = structuredClone(request.nominal ?? emptyBodyFit());

  if (parameter.kind === 'floorFrictionScale') fit.floorFrictionScale = value;
  else fit[parameter.kind][parameter.body] = value;

  return fit;
}
