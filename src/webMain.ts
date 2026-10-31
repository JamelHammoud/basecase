import { showsLanding } from './landing/showsLanding';

if (showsLanding()) {
  import('./landing/mountLanding');
} else {
  import('./main');
}
