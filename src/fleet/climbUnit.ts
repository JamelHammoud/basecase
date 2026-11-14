import { sendUnitCommand, subscribeFleetEvents, unitSnapshot } from '../robot/robotStore';
import { LADDER, rungIndex, type RobotEvent, type RobotMode } from '../robot/robotState';
import { unitOfEvent } from '../robot/robotUnits';
import { errorMessage } from '../utils/errorMessage';

type Answer = { mode: RobotMode } | { message: string };

const ANSWERS: Record<string, (event: RobotEvent) => Answer | null> = {
  mode: (event) => ({ mode: event.mode as RobotMode }),
  status: (event) => ({ mode: event.mode as RobotMode }),
  refused: (event) => ({ message: String(event.message ?? '') }),
  fault: (event) => ({ message: String(event.message ?? '') }),
  link: (event) => (event.state === 'connected' ? null : { message: String(event.message ?? '') }),
};

function answerTo(unit: string, mode: RobotMode) {
  let stop = () => {};
  const answer = new Promise<Answer>((resolve) => {
    stop = subscribeFleetEvents((event) => {
      const answer = unitOfEvent(event) === unit ? (ANSWERS[event.event]?.(event) ?? null) : null;

      if (!answer || ('mode' in answer && answer.mode !== mode)) return;

      stop();
      resolve(answer);
    });
  });

  return { answer, stop: () => stop() };
}

async function enter(unit: string, mode: RobotMode): Promise<string | null> {
  const pending = answerTo(unit, mode);

  try {
    const reply = await sendUnitCommand(unit, { cmd: 'enter', mode });

    if (!reply.ok) return reply.message;

    const got = await pending.answer;

    return 'message' in got ? got.message : null;
  } catch (error) {
    return errorMessage(error) || 'The robot couldn’t run the skill.';
  } finally {
    pending.stop();
  }
}

export async function climbUnit(unit: string, to: RobotMode): Promise<string | null> {
  for (;;) {
    const mode = unitSnapshot(unit)?.state.mode ?? 'look';

    if (rungIndex(mode) >= rungIndex(to)) return null;

    const refused = await enter(unit, LADDER[rungIndex(mode) + 1]);

    if (refused !== null) return refused;
  }
}
