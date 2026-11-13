import { renderToStaticMarkup } from 'react-dom/server';
import { WEB_APP_URL } from '../utils/platform/webDemo';
import { Landing } from './Landing';
import { CONTENT_FILES } from './pages/contentFiles';
import { renderPages, type SiteAssets } from './pages/renderPages';
import { SECTIONS } from './pages/sections';
import { readContent } from './pages/siteContent';

export const renderSite = () => renderToStaticMarkup(<Landing browserApp={WEB_APP_URL} sections={SECTIONS} />);

export const renderSitePages = (assets: SiteAssets) => renderPages(readContent(CONTENT_FILES, new Date()), assets);
