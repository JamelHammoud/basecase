import { capacityHold, measure } from './capacity.mjs';
import { backpressure, PRODUCERS } from './flow.mjs';
import { flowCounts } from './flowCounts.mjs';
import { repairOverflowHold } from './overflowPriority.mjs';

export async function dispatch({
  lane,
  module,
  context,
  gate = null,
  capacity = measure,
  counts = flowCounts,
  priority = repairOverflowHold,
}) {
  if (gate) {
    context.log(`waiting: ${gate}`);

    return;
  }

  const selected = module.selectWork?.(context);
  const actual = selected?.lane ?? lane;

  try {
    const held = dispatchHold({ module, actual, capacity, counts, priority });

    if (held) {
      context.log(`waiting: ${held}`);

      return;
    }

    await (selected?.run ?? module.default)(context);
  } finally {
    selected?.release();
  }
}

function dispatchHold({ module, actual, capacity, counts, priority }) {
  return (
    (module.schedule.agent ? capacityHold({ lane: actual, ...capacity() }) : null) ??
    (PRODUCERS.has(actual) ? backpressure(counts(), actual) : null) ??
    (module.schedule.agent ? priority(actual) : null)
  );
}
