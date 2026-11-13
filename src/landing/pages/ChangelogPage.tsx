import React from 'react';
import { EntryMeta } from './EntryMeta';
import { PageTitle } from './PageTitle';
import type { Entry } from './siteContent';
import { SiteMarkdown } from './SiteMarkdown';

const RSS_LINK = (
  <a href="/changelog/rss.xml" className="text-[15px] font-medium text-white/60 hover:text-white/90 transition-colors">
    RSS
  </a>
);

export const ChangelogPage: React.FC<{ entries: Entry[] }> = ({ entries }) => (
  <>
    <PageTitle action={RSS_LINK}>Changelog</PageTitle>
    <ol className="mt-[40px] list-none m-0 p-0 flex flex-col">
      {entries.map((entry) => (
        <li
          key={entry.slug}
          id={entry.slug}
          className="py-[28px] first:pt-0 border-t border-white/[0.06] first:border-0 scroll-mt-[24px]"
        >
          <EntryMeta entry={entry} />
          <h2 className="mt-[6px] text-[20px] leading-[1.3] font-semibold text-white/90">
            <a href={`#${entry.slug}`}>{entry.title}</a>
          </h2>
          <SiteMarkdown className="mt-[8px] text-[16px] leading-[1.55] text-white/60">{entry.body}</SiteMarkdown>
        </li>
      ))}
    </ol>
  </>
);
