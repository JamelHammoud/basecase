import type React from 'react';
import type { ContentKind } from './sections';
import type { PageHead } from './SitePage';

export interface SiteFile {
  fileName: string;
  source: string;
}

export interface PageSpec {
  fileName: string;
  head: PageHead;
  section: ContentKind;
  body: React.ReactNode;
  script?: boolean;
}
