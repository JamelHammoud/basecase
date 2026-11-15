import { serve } from '../utils/workerRpc';
import { worldAssetRestoreHandlers } from './worldAssetRestore';

serve(worldAssetRestoreHandlers);
