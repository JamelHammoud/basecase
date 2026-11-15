import { serve } from '../utils/workerRpc';
import { snapshotJobs } from './snapshotJobs';

serve(snapshotJobs);
