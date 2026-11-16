import { keepStudyTry } from '../studyFixture';
import type { StudyKnob } from '../../../study/types';
import type { Studio } from '../types';

export default function studyStudio(studio: Studio) {
  return {
    keepStudyTry: () => keepStudyTry(studio),
    configureStudy: (knobs: StudyKnob[]) => studio().core.study.configure(knobs),
    studyState: () => {
      const study = studio().core.study;

      return {
        keepStudyTry: () => keepStudyTry(studio),
        record: study.shown,
        preview: study.previewKey,
        running: study.running,
      };
    },
  };
}
