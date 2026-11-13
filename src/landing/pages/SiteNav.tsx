import React from 'react';
import { BasecaseLogo } from '../../design-system/BasecaseLogo';
import type { ContentKind, Section } from './sections';
import { SectionLinks } from './SectionLinks';

export const SiteNav: React.FC<{ sections: Section[]; current: ContentKind }> = ({ sections, current }) => (
  <nav className="flex items-center justify-between gap-[20px]">
    <a href="/" className="flex items-center rounded-[8px]" aria-label="Basecase">
      <BasecaseLogo className="w-[32px] h-[32px] text-white/90" />
    </a>
    <SectionLinks sections={sections} current={current} />
  </nav>
);
