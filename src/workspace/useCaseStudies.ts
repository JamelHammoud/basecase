import { useCaseCompare } from './useCaseCompare';
import { useStudy } from './useStudy';

type CompareOptions = Parameters<typeof useCaseCompare>[0];

type StudyOptions = Parameters<typeof useStudy>[0];

type CaseStudiesOptions = Omit<CompareOptions, 'source'> &
  Pick<StudyOptions, 'parts' | 'project' | 'sim' | 'onShow'> & {
    source: CompareOptions['source'] & StudyOptions['source'];
  };

export function useCaseStudies({
  inFront,
  kase,
  fingerprint,
  studio,
  source,
  parts,
  project,
  showToast,
  sim,
  onShow,
}: CaseStudiesOptions) {
  const caseCompare = useCaseCompare({ inFront, kase, fingerprint, studio, source, showToast });
  const study = useStudy({ kase, parts, project, source, sim, showToast, onShow });

  return { caseCompare, study };
}
