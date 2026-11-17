import { serve } from '../../workerRpc';
import { webSceneHistoryHandlers } from './webSceneHistory';

serve(webSceneHistoryHandlers);
