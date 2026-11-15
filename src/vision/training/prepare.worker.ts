import { serve } from '../../utils/workerRpc';
import { preparationJobs } from './prepareJobs';

serve(preparationJobs);
