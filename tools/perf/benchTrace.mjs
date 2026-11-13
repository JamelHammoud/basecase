const named = (events, name, pattern) => events.filter((e) => e.name === name && pattern.test(e.args?.name ?? ''));

export function threadTasks(trace, { process, thread }) {
  const events = JSON.parse(trace.toString()).traceEvents;
  const pids = new Set(named(events, 'process_name', process).map((e) => e.pid));
  const threads = new Set(
    named(events, 'thread_name', thread)
      .filter((e) => pids.has(e.pid))
      .map((e) => `${e.pid}:${e.tid}`),
  );

  return events
    .filter((e) => e.ph === 'X' && e.name === 'ThreadControllerImpl::RunTask' && threads.has(`${e.pid}:${e.tid}`))
    .map((e) => e.dur / 1000);
}
