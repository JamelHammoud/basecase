import React from 'react';
import { EntryImage } from './EntryImage';
import { EntryMeta } from './EntryMeta';
import { PageTitle } from './PageTitle';
import type { Entry } from './siteContent';
import { SiteMarkdown } from './SiteMarkdown';

const BACK: Partial<Record<Entry['kind'], { href: string; label: string }>> = {
  changelog: { href: '/changelog', label: 'Changelog' },
  blog: { href: '/blog', label: 'Blog' },
};

const dated = (entry: Entry) => entry.kind !== 'help';

export const ArticlePage: React.FC<{ entry: Entry }> = ({ entry }) => (
  <article>
    <PageTitle back={BACK[entry.kind]}>{entry.title}</PageTitle>
    {dated(entry) && (
      <div className="mt-[14px]">
        <EntryMeta entry={entry} />
      </div>
    )}
    {entry.image && <EntryImage src={entry.image} alt="" className="mt-[32px]" />}
    <SiteMarkdown className="mt-[32px] text-[16px] leading-[1.6] text-white/60">{entry.body}</SiteMarkdown>
    {entry.line && (
      <figure className="mt-[40px] pl-[14px] border-l-2 border-white/15">
        <blockquote className="text-[16px] leading-[1.6] text-white/90">{entry.line}</blockquote>
        <figcaption className="mt-[6px] text-[13px] text-white/50">Jamel</figcaption>
      </figure>
    )}
  </article>
);
