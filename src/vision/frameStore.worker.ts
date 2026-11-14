import { serve } from '../utils/workerRpc';
import { frameStoreJobs } from './frameStoreJobs';

serve(frameStoreJobs);
