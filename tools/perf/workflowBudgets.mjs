const limits = {
  inputP95Ms: 100,
  inputMaxMs: 250,
  frameGapP95Ms: 50,
  frameGapMaxMs: 100,
  longTaskMaxMs: 50,
  completionRatio: 1.1,
  sampledMemoryRatio: 1.1,
  sampledProcessMemoryRatio: 1.1,
};

export function workflowBudgets(rows, baseline = []) {
  return {
    limits,
    workloads: rows.map((row) => {
      const prior = baseline.find((entry) => entry.workload === row.workload);
      const measured = {
        inputP95Ms: row.inputToPaint.p95,
        inputMaxMs: row.inputToPaint.max,
        frameGapP95Ms: row.frameGaps.p95,
        frameGapMaxMs: row.frameGaps.max,
        longTaskMaxMs: row.longTasks.max,
        ...(prior
          ? {
              completionRatio: row.completionMs / prior.completionMs,
              sampledMemoryRatio: row.sampledPeakHeapAndBackingBytes / prior.sampledPeakHeapAndBackingBytes,
              ...(prior.processMemory?.sampledPeakSummedResidentBytes &&
              row.processMemory?.sampledPeakSummedResidentBytes
                ? {
                    sampledProcessMemoryRatio:
                      row.processMemory.sampledPeakSummedResidentBytes /
                      prior.processMemory.sampledPeakSummedResidentBytes,
                  }
                : {}),
            }
          : {}),
      };

      return {
        workload: row.workload,
        measured,
        violations: Object.entries(measured)
          .filter(([name, value]) => value > limits[name])
          .map(([name]) => name),
        durable: row.durable && row.reopened,
      };
    }),
  };
}
