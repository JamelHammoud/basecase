import type { SkillsRuntime } from '../skills/skillsRuntime';
import { errorMessage } from '../utils/errorMessage';

export const busyLine = (label: string) => `${label} is training. Stop it first.`;

export async function trainingProblem(
  runtime: Pick<SkillsRuntime, 'training'>,
  start: () => Promise<string | null>,
): Promise<string | null> {
  const training = runtime.training;

  if (training) return busyLine(training);

  try {
    const refused = await start();

    return refused && runtime.training ? busyLine(runtime.training) : refused;
  } catch (error) {
    return errorMessage(error);
  }
}
