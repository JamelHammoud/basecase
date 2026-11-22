export function workflowCpu(buffer) {
  const events = JSON.parse(buffer.toString()).traceEvents;
  const threads = new Map(
    events
      .filter((entry) => entry.name === 'thread_name')
      .map((entry) => [`${entry.pid}:${entry.tid}`, entry.args?.name ?? '']),
  );
  const costs = { rendererMs: 0, workerMs: 0, gpuMs: 0, rendererCpuMs: 0, workerCpuMs: 0, gpuCpuMs: 0 };

  for (const event of events) {
    if (event.ph !== 'X' || event.name !== 'ThreadControllerImpl::RunTask') continue;

    const name = threads.get(`${event.pid}:${event.tid}`) ?? '';
    const kind = name.includes('DedicatedWorker') ? 'workerMs' : null;
    const target = kind ?? { CrRendererMain: 'rendererMs', CrGpuMain: 'gpuMs' }[name];

    if (!target) continue;

    costs[target] += event.dur / 1000;

    const cpu = { rendererMs: 'rendererCpuMs', workerMs: 'workerCpuMs', gpuMs: 'gpuCpuMs' }[target];

    costs[cpu] += (event.tdur ?? 0) / 1000;
  }

  return { ...costs, threadLabels: [...new Set(threads.values())].filter((name) => /Worker|Renderer|Gpu/.test(name)) };
}
