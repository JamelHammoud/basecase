import type { BodyAnalysisResult, BodyAnalysisDirection } from './bodyAnalysisTypes';
import { BODY_ANALYSIS_METHOD } from './bodyAnalysisTypes';
import { bodyInformationContributions } from './bodyMotionInformation';
import type { BodySequence } from './bodySequenceTypes';

export function sequenceResolved(sequence: Pick<BodySequence, 'directions' | 'selected'>) {
  return !sequence.directions.some(
    (direction) =>
      !direction.distinguishable &&
      sequence.selected.some((index) => Math.abs(direction.weights[index]) >= BODY_ANALYSIS_METHOD.directionLoading),
  );
}

export function sequenceColumns(result: BodyAnalysisResult) {
  return informationColumns(result.directions);
}

export function informationColumns(directions: BodyAnalysisDirection[]) {
  return directions.map((_, index) =>
    Float64Array.from(
      directions,
      (direction) => direction.weights[index] * direction.response * Math.sqrt(directions.length),
    ),
  );
}

export function sequenceInformation(
  sequence: Pick<BodySequence, 'directions' | 'selected'>,
  candidate: Float64Array[],
) {
  return bodyInformationContributions({ original: sequence.directions, candidate, selected: sequence.selected });
}

export function accumulatedBodyAnalysis(
  result: BodyAnalysisResult,
  directions: BodyAnalysisDirection[],
): BodyAnalysisResult {
  const parameters = result.parameters.map((parameter, index) => {
    const response = Math.sqrt(
      directions.reduce((sum, direction) => sum + (direction.weights[index] * direction.response) ** 2, 0),
    );
    const coupled = directions.some(
      (direction) =>
        !direction.distinguishable && Math.abs(direction.weights[index]) >= BODY_ANALYSIS_METHOD.directionLoading,
    );

    if (response < BODY_ANALYSIS_METHOD.absoluteResponse)
      return { ...parameter, response, distinguishability: 'poor-excitation' as const };

    return {
      ...parameter,
      response,
      distinguishability: coupled ? ('coupled' as const) : ('distinguishable' as const),
    };
  });

  return { ...result, parameters, directions };
}
