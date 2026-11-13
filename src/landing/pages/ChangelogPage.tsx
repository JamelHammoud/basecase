import React from 'react';
import { EntryImage } from './EntryImage';
import { EntryMeta } from './EntryMeta';
import { PageTitle } from './PageTitle';
import { entryPath, type Entry } from './siteContent';

export const ChangelogPage: React.FC<{ entries: Entry[] }> = ({ entries }) => (
  <>
    <PageTitle>Changelog</PageTitle>
    <ol className="mt-[40px] list-none m-0 p-0 flex flex-col">
      {entries.map((entry) => (
        <li
          key={entry.slug}
          id={entry.slug}
          className="py-[32px] first:pt-0 border-t border-white/[0.06] first:border-0 scroll-mt-[24px]"
        >
          <a href={entryPath(entry)} className="group flex flex-col">
            {entry.image && <EntryImage src={entry.image} alt="" className="mb-[16px]" />}
            <EntryMeta entry={entry} />
            <h2 className="mt-[6px] text-[20px] leading-[1.3] font-semibold text-white/90 group-hover:underline underline-offset-2">
              {entry.title}
            </h2>
            <p className="mt-[8px] text-[16px] leading-[1.55] text-white/60">{entry.summary}</p>
          </a>
        </li>
      ))}
    </ol>
  </>
);
