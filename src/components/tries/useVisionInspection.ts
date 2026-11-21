import { useEffect, useState } from 'react';
import { loadDatasetContent } from '../../datasets/datasetStore/content';
import { evaluationWorker } from '../../vision/training/evaluationWorker';
import type { ComparisonImage } from '../../vision/training/inspection';
import type { TrainingEvaluation } from '../../vision/training/types';
import type { inspectionImage } from '../../vision/training/inspectionImage';
import type { ImageGroupSupport } from '../../vision/training/conditionEvaluation';
import { inspectionContextKey } from '../../vision/training/inspectionContext';
import { errorMessage } from '../../utils/errorMessage';

export interface VisionInspectionReports {
  candidate: TrainingEvaluation;
  incumbent: TrainingEvaluation;
}
export type InspectionImage = Awaited<ReturnType<typeof inspectionImage>>;

export function useVisionInspection(reports: VisionInspectionReports, selected: ComparisonImage | null) {
  const { candidate, incumbent } = reports;
  const [index, setIndex] = useState<{
    candidate: TrainingEvaluation;
    incumbent: TrainingEvaluation;
    images: ComparisonImage[];
    groups: ImageGroupSupport[];
    unlabeled: number;
    groupProblem: string;
    problem: string;
  } | null>(null);
  const [loaded, setLoaded] = useState<{
    selection: ComparisonImage;
    image?: InspectionImage;
    problem?: string;
  } | null>(null);

  useEffect(() => {
    let live = true;

    evaluationWorker
      .call('inspectionIndex', { candidate, incumbent })
      .then(({ indices, groups, unlabeled, groupProblem }) => {
        if (!live) return;

        const images = indices.map(([next, previous]) => ({
          candidate: candidate.evidence!.frames[next],
          incumbent: incumbent.evidence!.frames[previous],
        }));

        setIndex({ candidate, incumbent, images, groups, unlabeled, groupProblem, problem: '' });
      })
      .catch((error: unknown) => {
        if (live)
          setIndex({
            candidate,
            incumbent,
            images: [],
            groups: [],
            unlabeled: 0,
            groupProblem: '',
            problem: errorMessage(error),
          });
      });

    return () => {
      live = false;
      void evaluationWorker.call('releaseInspection', inspectionContextKey({ candidate, incumbent })).catch(() => {});
    };
  }, [candidate, incumbent]);

  useEffect(() => {
    if (!selected) return;

    let live = true;

    loadDatasetContent(selected.candidate.sample.content)
      .then(async (bytes) => {
        if (!bytes || !live) throw new Error('Frozen image is unavailable');

        return evaluationWorker.call(
          'inspectionImage',
          {
            sample: selected.candidate.sample,
            bytes,
            candidate: selected.candidate.prediction,
            incumbent: selected.incumbent.prediction,
            task: candidate.task,
          },
          [bytes.buffer],
        );
      })
      .then((image) => {
        if (live) setLoaded({ selection: selected, image });
      })
      .catch(() => {
        if (live) setLoaded({ selection: selected, problem: 'Frozen image is unavailable' });
      });

    return () => {
      live = false;
    };
  }, [selected, candidate.task]);

  return {
    index: index?.candidate === candidate && index.incumbent === incumbent ? index : null,
    loaded: loaded?.selection === selected ? loaded : null,
  };
}
