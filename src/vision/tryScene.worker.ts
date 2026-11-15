import { serve } from '../utils/workerRpc';
import { trySceneJobs } from './trySceneJobs';

serve(trySceneJobs);
