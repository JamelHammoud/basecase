import React from 'react';
import { EntryMeta } from './EntryMeta';
import { PageTitle } from './PageTitle';
import { entryPath, type Entry } from './siteContent';

export const EntryList: React.FC<{ title: string; entries: Entry[]; dated?: boolean }> = ({
  title,
  entries,
  dated,
}) => (
  <>
    <PageTitle>{title}</PageTitle>
    <ul className="mt-[40px] list-none m-0 p-0 flex flex-col gap-[28px]">
      {entries.map((entry) => (
        <li key={entry.slug} className="flex flex-col gap-[6px]">
          {dated && <EntryMeta entry={entry} />}
          <h2 className="text-[18px] leading-[1.3] font-semibold text-white/90">
            <a href={entryPath(entry)} className="hover:underline underline-offset-2">
              {entry.title}
            </a>
          </h2>
          {entry.summary && <p className="text-[15px] leading-[1.5] text-white/60">{entry.summary}</p>}
        </li>
      ))}
    </ul>
  </>
);
