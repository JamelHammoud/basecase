import { serve } from '../utils/workerRpc';
import { persistenceHandlers } from './frameSetPersistence';

serve(persistenceHandlers);
