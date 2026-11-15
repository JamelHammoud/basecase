import { serve } from '../utils/workerRpc';
import { labelEditsJobs } from './labelEditsJobs';

serve(labelEditsJobs);
