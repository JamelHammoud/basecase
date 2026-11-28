import { openApp, type App } from './harness';

export function appAttempt(prepare: () => Promise<unknown>, open: () => Promise<App> = openApp) {
  let retired = false;
  let closing: Promise<void> | undefined;
  const acquiring = Promise.resolve()
    .then(prepare)
    .then(() => {
      if (retired) throw new Error('Studio setup was closed.');

      return open();
    });
  const close = () => {
    retired = true;
    closing ??= acquiring.then(
      (app) => app.close(),
      () => undefined,
    );

    return closing;
  };
  const ready = acquiring.then(async (app) => {
    if (!retired) return app;

    await close();

    throw new Error('Studio setup was closed.');
  });

  return { ready, close };
}
