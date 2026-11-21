import type { BodyAnalysisParameter } from './bodyAnalysisTypes';

const kind = { massScales: 'Mass scale', payloadKg: 'Payload', floorFrictionScale: 'Floor friction scale' };

export const bodyParameterLabel = (parameter: BodyAnalysisParameter) => `${parameter.label} ${kind[parameter.kind]}`;
