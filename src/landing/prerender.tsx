import { renderToStaticMarkup } from 'react-dom/server';
import { WEB_APP_URL } from '../utils/platform/webDemo';
import { Landing } from './Landing';

export const renderSite = () => renderToStaticMarkup(<Landing browserApp={WEB_APP_URL} />);
