import { blobToDataUrl } from '../utils/imageEncode';
import { FILM_FRAMES } from './caseFilm';
import type { FilmShot } from './filmstrip';
import { drawFilmstrip } from './filmstripClient';

const FRAME_W = 320;
const FRAME_H = 240;

export async function filmImage(shot: FilmShot): Promise<string | null> {
  const blob = await drawFilmstrip(
    { ...shot, frames: FILM_FRAMES, width: FRAME_W, height: FRAME_H },
    { type: 'image/png' },
  );

  return blob ? blobToDataUrl(blob) : null;
}
