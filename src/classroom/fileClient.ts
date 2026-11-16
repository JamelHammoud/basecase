import { workerClient } from '../utils/workerRpc';
import type { ClassroomFiles } from './files';

export const classroomFileClient = () =>
  workerClient<ClassroomFiles>(
    () => new Worker(new URL('./files.worker.ts', import.meta.url), { type: 'module' }),
    () => {
      if (typeof document !== 'undefined') return Promise.reject(new Error('Reload Classroom to open files.'));

      return import('./files').then((m) => m.classroomFiles);
    },
  );
