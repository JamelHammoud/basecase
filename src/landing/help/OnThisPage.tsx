import React from 'react';
import type { Heading } from './headings';

export const OnThisPage: React.FC<{ title: string; headings: Heading[] }> = ({ title, headings }) => (
  <nav aria-label={title} className="mt-[32px] xl:mt-0 xl:absolute xl:inset-y-0 xl:left-[calc(100%+56px)] xl:w-[200px]">
    <div className="xl:sticky xl:top-[56px]">
      <h2 className="text-[13px] font-medium text-white/50">{title}</h2>
      <ul className="mt-[10px] list-none m-0 p-0 flex flex-col gap-[8px]">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              className="text-[14px] leading-[1.4] text-white/60 transition-colors duration-150 hover:text-white/90"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  </nav>
);
