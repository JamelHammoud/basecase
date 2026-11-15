import { serve } from '../utils/workerRpc';
import { SKILL_RANK_HANDLERS } from './skillRankJob';

serve(SKILL_RANK_HANDLERS);
