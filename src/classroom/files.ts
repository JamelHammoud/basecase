import { classroomBundle, type ClassroomSource } from './source';
import { reply } from '../utils/workerRpc';
import {
  assignmentOf,
  classroomBytes,
  CLASSROOM_MAX_BYTES,
  readAssignment,
  readSubmission,
  submissionOf,
  pinnedBundle,
  type Submission,
  type Assignment,
} from './envelope';

async function fileBytes(file: Blob) {
  if (file.size > CLASSROOM_MAX_BYTES) throw new Error('Classroom file is too large.');

  return new Uint8Array(await file.arrayBuffer());
}

export const classroomFiles = {
  attempt: async ({ assignment, submission }: { assignment: Assignment; submission?: Submission }) => {
    const checked = await readAssignment(classroomBytes(assignment));
    const robot = submission ? await readSubmission(classroomBytes(submission)) : null;
    const bundle = robot ? await pinnedBundle(checked, robot) : checked.bundle;

    return reply({ assignment: checked, bundle, design: robot?.design ?? checked.design });
  },
  pin: async ({ assignment, submission }: { assignment: Assignment; submission: Submission }) => {
    const teacher = await readAssignment(classroomBytes(assignment));
    const robot = await readSubmission(classroomBytes(submission));

    return reply({ bundle: await pinnedBundle(teacher, robot), design: robot.design });
  },
  assignment: async (file: Blob) => reply(await readAssignment(await fileBytes(file))),
  submission: async (file: Blob) => reply(await readSubmission(await fileBytes(file))),
  exportAssignment: async ({ input, budgetUsd }: { input: ClassroomSource; budgetUsd: number }) => {
    const assignment = await assignmentOf(await classroomBundle(input), budgetUsd, undefined, input.design);
    const bytes = classroomBytes(assignment);

    return reply(bytes, [bytes.buffer]);
  },
  submit: async ({ input, assignment, name }: { input: ClassroomSource; assignment: Assignment; name: string }) => {
    const bundle = await classroomBundle({ ...input, source: { ...input.source, kase: assignment.bundle.case } });
    const bytes = classroomBytes(await submissionOf(assignment, bundle, name, input.design));

    return reply(bytes, [bytes.buffer]);
  },
};

export type ClassroomFiles = typeof classroomFiles;
