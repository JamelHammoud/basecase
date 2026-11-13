import React from 'react';
import { entryPath } from '../pages/siteContent';
import type { HelpArticle } from './helpArticle';

const CARD_CLASS =
  'flex-1 flex flex-col gap-[4px] p-[16px] rounded-[12px] bg-white/[0.04] transition-colors duration-150 hover:bg-white/[0.07]';

const NeighbourLink: React.FC<{ article: HelpArticle; label: string; end?: boolean }> = ({ article, label, end }) => (
  <a href={entryPath(article)} rel={end ? 'next' : 'prev'} className={`${CARD_CLASS} ${end ? 'sm:text-right' : ''}`}>
    <span className="text-[13px] text-white/50">{label}</span>
    <span className="text-[15px] leading-[1.35] font-medium text-white/90">{article.title}</span>
  </a>
);

export const PrevNext: React.FC<{ previous?: HelpArticle; next?: HelpArticle }> = ({ previous, next }) => (
  <nav aria-label="More in this collection" className="mt-[56px] flex flex-col sm:flex-row gap-[8px]">
    {previous ? <NeighbourLink article={previous} label="Previous" /> : <span className="hidden sm:block flex-1" />}
    {next && <NeighbourLink article={next} label="Next" end />}
  </nav>
);
