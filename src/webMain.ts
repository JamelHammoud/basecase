import { galleryBundleSource } from './gallery/galleryLinks';
import { showsLanding } from './landing/showsLanding';

const source = galleryBundleSource(location.pathname);

if (showsLanding()) {
  import('./landing/mountLanding');
} else if (source) {
  import('./gallery/mountGallery').then((m) => m.mountGallery(source));
} else {
  import('./main');
}
