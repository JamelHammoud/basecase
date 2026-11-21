import { serve } from '../utils/workerRpc';
import { tryArchiveJobs } from './tryArchiveJobs';

serve(tryArchiveJobs);
