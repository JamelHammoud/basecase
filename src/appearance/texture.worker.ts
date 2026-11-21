import { serve } from '../utils/workerRpc';
import { textureHandlers } from './textureOps';

serve(textureHandlers);
