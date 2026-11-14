import { useCaseCompare } from './useCaseCompare';
import { useCaseExplore } from './useCaseExplore';

type CompareOptions = Parameters<typeof useCaseCompare>[0];

type ExploreOptions = Parameters<typeof useCaseExplore>[0];

type CaseStudiesOptions = Omit<CompareOptions, 'source'> &
  Pick<ExploreOptions, 'parts' | 'project'> & { source: CompareOptions['source'] & ExploreOptions['source'] };

export function useCaseStudies({
  inFront,
  kase,
  fingerprint,
  studio,
  source,
  parts,
  project,
  showToast,
}: CaseStudiesOptions) {
  const caseCompare = useCaseCompare({ inFront, kase, fingerprint, studio, source, showToast });
  const caseExplore = useCaseExplore({ kase, parts, project, source, showToast });

  return { caseCompare, caseExplore };
}
