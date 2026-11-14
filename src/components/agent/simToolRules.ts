import {
  CasesIcon,
  CheckIcon,
  CodeIcon,
  DeleteIcon,
  EditIcon,
  LookIcon,
  RoutinesIcon,
  RunIcon,
  SwapIcon,
  TrainIcon,
} from '../../design-system';
import { plainRule, type ToolRule } from './toolRule';

export const SIM_RULES: ToolRule[] = [
  plainRule(['create_case'], CasesIcon, ['Making a Case', 'Made a Case']),
  plainRule(['run_case'], RunIcon, ['Running the Case', 'Ran the Case']),
  plainRule(['read_try'], LookIcon, ['Reading a try', 'Read a try']),
  plainRule(['write_case_code'], CodeIcon, ['Writing the Case’s code', 'Wrote the Case’s code']),
  plainRule(['read_case_code'], LookIcon, ['Reading the Case’s code', 'Read the Case’s code']),
  plainRule(['delete_case_code'], DeleteIcon, ['Deleting a code panel', 'Deleted a code panel']),
  plainRule(['explore_case'], SwapIcon, ['Exploring servos', 'Explored servos']),
  plainRule(['make_routine'], RoutinesIcon, ['Making a Routine', 'Made a Routine']),
  plainRule(['read_routine'], LookIcon, ['Reading the Routine', 'Read the Routine']),
  plainRule(['edit_routine'], EditIcon, ['Editing the Routine', 'Edited the Routine']),
  plainRule(['test_routine'], CheckIcon, ['Testing the Routine', 'Tested the Routine']),
  plainRule(['run_routine'], RunIcon, ['Running the Routine', 'Ran the Routine']),
  plainRule(['draft_skill'], TrainIcon, ['Drafting a skill', 'Drafted a skill']),
  plainRule(['train_skill'], TrainIcon, ['Starting training', 'Started training']),
  plainRule(['list_skills'], TrainIcon, ['Checking skills', 'Checked skills']),
  plainRule(['training_status'], TrainIcon, ['Checking training', 'Checked training']),
];
