import createMujoco, { type MainModule } from '@mujoco/mujoco';

const LOAD_PROGRESS = /^(still waiting on run dependencies:|dependency: |\(end of list\))/;

export const isLoadProgress = (text: string) => LOAD_PROGRESS.test(text);

const printErr = (text: string) => {
  if (!isLoadProgress(text)) console.error(text);
};

export const loadMujoco = (): Promise<MainModule> => createMujoco({ printErr });
