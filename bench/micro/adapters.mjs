import { AdapterMissing } from './adapterMissing.mjs';
import { craft, enclosures, removalOrder, serviceDepth, servoSolver } from './appAdapters.mjs';
import { probeFasteners } from './fasteners.mjs';

export const missing = (name, what) => () => {
  throw new AdapterMissing(name, what);
};

function needApp(ctx, name, what) {
  if (!ctx.app) throw new AdapterMissing(name, `${what} from the running app`);

  return ctx.app;
}

export function parseBomTotal(text) {
  const est = /With list-price estimates for the rest: ~\$([\d,]+(?:\.\d+)?)/.exec(text ?? '');
  const budget = /Budget \$([\d,]+(?:\.\d+)?)/.exec(text ?? '');
  const num = (m) => (m ? Number(m[1].replace(/,/g, '')) : null);

  return { estimatedUsd: num(est), budgetUsd: num(budget), unpriced: /plus (\d+) lines with no price/.exec(text)?.[1] };
}

const STATUS = { PASS: 'pass', WARN: 'warn', FAIL: 'fail', 'NOT RUN': 'not run' };

export function parseCheckRows(text) {
  return (text ?? '')
    .split('\n')
    .map((line) => /^(PASS|WARN|FAIL|NOT RUN) · ([^:]+): (.*)$/.exec(line))
    .filter(Boolean)
    .map(([, status, check, detail]) => ({ check, status: STATUS[status], detail }));
}

export const STS3215_OUTPUT = { point: [-12.66, 18.9, -0.16], axis: [0, 1, 0] };

export const DEFAULT_ADAPTERS = {
  fasteners: (_ctx, scene) => probeFasteners(scene),
  removalOrder,
  serviceDepth,
  enclosures,
  craft,
  outlineFit: missing('outlineFit', 'the target-outline grader (Vision masks)'),
  servoSolver,
  servoOutput: (_ctx, part) => (/sts3215/.test(part.componentId ?? '') ? STS3215_OUTPUT : null),
  bom: async (ctx) => {
    const res = await needApp(ctx, 'bom', 'the BOM').call('bom');

    return res.data ?? parseBomTotal(res.text);
  },
  checkRows: async (ctx) =>
    parseCheckRows((await needApp(ctx, 'checkRows', 'the engineering checks').call('verify')).text),
};

export const withAdapters = (overrides = {}) => ({ ...DEFAULT_ADAPTERS, ...overrides });

export const MINIMAL_ADAPTERS = ['fasteners', 'servoOutput', 'bom', 'checkRows'];

export { AdapterMissing };
