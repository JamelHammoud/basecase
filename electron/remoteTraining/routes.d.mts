interface RemoteTrainingTarget {
  status(): unknown;

  configure(config: unknown): Promise<unknown>;

  clear(): unknown;
}

export function registerRemoteTrainingHandlers(
  ipcMain: { handle(channel: string, handler: (event: unknown, payload: unknown) => unknown): void },
  training: RemoteTrainingTarget,
): void;

export function remoteTrainingPostRoutes(
  training: RemoteTrainingTarget,
): Array<[string, (body: { arg?: unknown } | null) => Promise<unknown>]>;
