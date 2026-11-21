import { capacityHold, measure } from './capacity.mjs';
import { backpressure, PRODUCERS } from './flow.mjs';
import { flowCounts } from './flowCounts.mjs';

export async function dispatch({ lane, module, context, gate = null, capacity = measure, counts = flowCounts }) {
  if (gate) {
    context.log(`waiting: ${gate}`);

    return;
  }

  const selected = module.selectWork?.(context);
  const actual = selected?.lane ?? lane;

  try {
    const held =
      (module.schedule.agent ? capacityHold({ lane: actual, ...capacity() }) : null) ??
      (PRODUCERS.has(actual) ? backpressure(counts(), actual) : null);

    if (held) {
      context.log(`waiting: ${held}`);

      return;
    }

    await (selected?.run ?? module.default)(context);
  } finally {
    selected?.release();
  }
}
