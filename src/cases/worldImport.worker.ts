import { serve } from '../utils/workerRpc';
import { worldImportHandlers } from './worldImportOps';

serve(worldImportHandlers);
