import { gallerySlug } from './gallery/galleryBundle';
import { showsLanding } from './landing/showsLanding';

const slug = gallerySlug(location.pathname);

if (showsLanding()) {
  import('./landing/mountLanding');
} else if (slug) {
  import('./gallery/mountGallery').then((m) => m.mountGallery(slug));
} else {
  import('./main');
}
