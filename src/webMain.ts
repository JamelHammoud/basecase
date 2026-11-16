import { galleryBundleSource } from './gallery/galleryLinks';
import { leagueSource } from './leagues/boardSource';
import { showsLanding } from './landing/showsLanding';

const source = galleryBundleSource(location.pathname);
const league = leagueSource(location.pathname);

if (location.pathname === '/fleet' || location.pathname === '/fleet/enroll') {
  import('./fleet/browser/mountFleet');
} else if (showsLanding()) {
  import('./landing/mountLanding');
} else if (league) {
  import('./leagues/mountLeague').then((m) => m.mountLeague(league));
} else if (source) {
  import('./gallery/mountGallery').then((m) => m.mountGallery(source));
} else {
  import('./main');
}
