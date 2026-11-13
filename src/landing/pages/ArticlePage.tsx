import React from 'react';
import { EntryMeta } from './EntryMeta';
import { PageTitle } from './PageTitle';
import type { Entry } from './siteContent';
import { SiteMarkdown } from './SiteMarkdown';

export const ArticlePage: React.FC<{ entry: Entry }> = ({ entry }) => (
  <article>
    <PageTitle>{entry.title}</PageTitle>
    {entry.kind === 'blog' && (
      <div className="mt-[14px]">
        <EntryMeta entry={entry} />
      </div>
    )}
    <SiteMarkdown className="mt-[32px] text-[16px] leading-[1.6] text-white/60">{entry.body}</SiteMarkdown>
    {entry.line && (
      <figure className="mt-[40px] pl-[14px] border-l-2 border-white/15">
        <blockquote className="text-[16px] leading-[1.6] text-white/90">{entry.line}</blockquote>
        <figcaption className="mt-[6px] text-[13px] text-white/50">Jamel</figcaption>
      </figure>
    )}
  </article>
);
