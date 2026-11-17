export const ROUTER_VERSION: string;
export const ROUTER_HASH: string;
export const ROUTER_JAVA_VERSION: string;
export function routeTools(): Promise<{ java: string; jar: string; python: string }>;
export function routeToolStatus(
  input?: unknown,
  options?: { temporaryRoot?: string; signal?: AbortSignal },
): Promise<{ issues: string[] }>;
