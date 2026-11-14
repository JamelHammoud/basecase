import { isPolicySpec, policyObsSize, type PolicyLayer, type PolicySpec } from '../sim/policy';

const MAX_LAYERS = 8;
const MAX_WIDTH = 4096;
const MAX_WEIGHTS = 4_000_000;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const finiteList = (v: unknown, length: number) => Array.isArray(v) && v.length === length && v.every(finite);

const fitsWidth = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) <= MAX_WIDTH;

function layerFits(layer: PolicyLayer, width: number) {
  return (
    !!layer &&
    layer.in === width &&
    fitsWidth(layer.out) &&
    finiteList(layer.w, layer.in * layer.out) &&
    finiteList(layer.b, layer.out)
  );
}

function layersFit(spec: PolicySpec) {
  const { layers } = spec;
  const width = policyObsSize(spec);

  if (!layers.length || layers.length > MAX_LAYERS || !fitsWidth(width)) return false;

  if (layers.reduce((n, l) => n + (Number(l?.in) || 0) * (Number(l?.out) || 0), 0) > MAX_WEIGHTS) return false;

  return (
    layers.every((layer, k) => layerFits(layer, k === 0 ? width : layers[k - 1].out)) &&
    layers.at(-1)?.out === spec.joints.length
  );
}

function fieldsFit(spec: PolicySpec) {
  const n = spec.joints.length;
  const width = policyObsSize(spec);

  return (
    spec.joints.every((j) => typeof j === 'string') &&
    finiteList(spec.defaultPose, n) &&
    finiteList(spec.command, 3) &&
    finiteList(spec.obsMean, width) &&
    finiteList(spec.obsStd, width) &&
    spec.obsStd.every((s) => s > 0) &&
    finite(spec.actionScale) &&
    finite(spec.controlDt) &&
    spec.controlDt > 0 &&
    (spec.activation === 'elu' || spec.activation === 'tanh') &&
    (spec.squash === undefined || spec.squash === 'tanh')
  );
}

export function isRunnablePolicy(value: unknown): value is PolicySpec {
  return isPolicySpec(value) && fieldsFit(value) && layersFit(value);
}
