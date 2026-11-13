import React from 'react';
import type { ContentKind, Section } from './sections';
import { absoluteUrl, SITE_URL } from './siteContent';
import { SiteNav } from './SiteNav';

export interface PageHead {
  title: string;
  description: string;
  path: string;
  feeds?: { href: string; type: string; title: string }[];
  image?: string;
}

interface SitePageProps {
  head: PageHead;
  section: ContentKind;
  sections: Section[];
  stylesheets: string[];
  children: React.ReactNode;
}

export const SitePage: React.FC<SitePageProps> = ({ head, section, sections, stylesheets, children }) => (
  <html lang="en">
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      <title>{head.title}</title>
      <meta name="description" content={head.description} />
      <link rel="canonical" href={`${SITE_URL}${head.path}`} />
      <meta name="theme-color" content="#121212" />
      <meta name="color-scheme" content="dark" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Basecase" />
      <meta property="og:url" content={`${SITE_URL}${head.path}`} />
      <meta property="og:title" content={head.title} />
      <meta property="og:description" content={head.description} />
      <meta property="og:image" content={absoluteUrl(head.image ?? '/og.png')} />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      {head.feeds?.map((feed) => (
        <link key={feed.href} rel="alternate" type={feed.type} title={feed.title} href={feed.href} />
      ))}
      {stylesheets.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
    </head>
    <body>
      <main className="min-h-dvh px-[24px] pt-[max(40px,env(safe-area-inset-top))] pb-[max(56px,env(safe-area-inset-bottom))] sm:pt-[56px] sm:pb-[96px]">
        <div className="w-full max-w-[640px] mx-auto">
          <SiteNav sections={sections} current={section} />
          {children}
        </div>
      </main>
    </body>
  </html>
);
