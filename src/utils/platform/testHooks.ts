import { TEST_HOOKS_FLAG } from './testHooksFlag';

export const exposesTestHooks = () =>
  import.meta.env.DEV || (globalThis as Record<string, unknown>)[TEST_HOOKS_FLAG] === true;
