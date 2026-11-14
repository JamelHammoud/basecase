import { reply, serve } from '../utils/workerRpc';
import { exportCutFiles } from '../sheet/cutFiles';
import type { CutFileItem } from './cutFileExport';

serve({
  build: (items: CutFileItem[]) => {
    const zip = exportCutFiles(items);

    return reply(zip, [zip.buffer]);
  },
});
