import { WEB_APP_URL } from '../utils/platform/webDemo';
import { SECTIONS } from './pages/sections';
import { renderLanding } from './renderLanding';

renderLanding({ browserApp: WEB_APP_URL, sections: SECTIONS });
