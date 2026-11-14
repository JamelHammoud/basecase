import { Refusal, Slant3dClient, UNREADABLE, isUuid } from './slant3dClient.mjs';

export const MAX_SHAPES = 200;
export const MAX_STL_BYTES = 64 * 1024 * 1024;

const PROFILES = ['PLA', 'PETG'];
const PLATFORM = { name: 'Basecase', url: 'https://basecase.so' };

class PartFailure extends Error {}

const fileName = (name) =>
  `${
    String(name ?? '')
      .replace(/[^\w -]+/g, '-')
      .slice(0, 60)
      .trim() || 'part'
  }.stl`;

const bytesOf = (stl) => (typeof stl === 'string' ? Buffer.from(stl, 'base64') : Buffer.from(stl ?? []));

function checkedPrice(data, copies) {
  const total = data?.total;

  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0) throw new PartFailure(UNREADABLE);

  if (data.quantity !== undefined && data.quantity !== copies) throw new PartFailure(UNREADABLE);

  return Math.round(total * 100) / 100;
}

const copiesOf = (shape) => {
  const copies = Number(shape?.copies);

  return Number.isInteger(copies) && copies >= 1 && copies <= 1000 ? copies : 1;
};

function pickFilament(filaments, profile) {
  const offered = filaments.filter((f) => f?.profile === profile && f.available !== false && isUuid(f.publicId));
  const black = offered.find((f) => /black/.test(String(f.color)));

  return (black ?? offered[0])?.publicId;
}

export class Slant3dQuotes {
  constructor({ key, origin, outbound }) {
    this.client = new Slant3dClient({ key, origin, outbound });
    this.platformId = null;
    this.filaments = null;
  }

  async platform() {
    if (this.platformId) return this.platformId;

    const list = await this.client.call('/platforms');
    const found = (Array.isArray(list) ? list : []).find((p) => isUuid(p?.id))?.id;
    const id = found ?? (await this.client.call('/platforms', { method: 'POST', json: PLATFORM }))?.id;

    if (!isUuid(id)) throw new Error(UNREADABLE);

    this.platformId = id;

    return id;
  }

  async filamentFor(material) {
    if (!PROFILES.includes(material)) return null;

    if (!this.filaments) {
      const list = await this.client.call(`/filaments?profile=${PROFILES.join(',')}`);

      this.filaments = Array.isArray(list) ? list : [];
    }

    return pickFilament(this.filaments, material) ?? null;
  }

  async uploaded(shape, { bytes, platformId }) {
    const ticket = await this.client.call('/files/direct-upload', {
      method: 'POST',
      json: { name: fileName(shape.name), platformId },
    });

    if (typeof ticket?.presignedUrl !== 'string' || !ticket.filePlaceholder) throw new PartFailure(UNREADABLE);

    await this.client.upload(ticket.presignedUrl, bytes).catch((e) => {
      throw e instanceof PartFailure ? e : new PartFailure(e.message);
    });

    const file = await this.client.call('/files/confirm-upload', {
      method: 'POST',
      json: { filePlaceholder: ticket.filePlaceholder },
    });

    if (!isUuid(file?.publicFileServiceId)) throw new PartFailure(UNREADABLE);

    return file.publicFileServiceId;
  }

  async quoteOne(shape, platformId) {
    const filamentId = await this.filamentFor(shape.material);

    if (!filamentId)
      return {
        part: shape.part,
        refusal: `Slant 3D doesn’t print ${shape.material}. Set its material to PLA or PETG.`,
      };

    const bytes = bytesOf(shape.stl);

    if (bytes.byteLength > MAX_STL_BYTES)
      return { part: shape.part, refusal: 'Its STL is over 64 MB, too large to upload.' };

    const copies = copiesOf(shape);

    try {
      const fileId = await this.uploaded(shape, { bytes, platformId });
      const estimate = await this.client.call(`/files/${fileId}/estimate`, {
        method: 'POST',
        json: { options: { filamentId, quantity: copies } },
      });

      return { part: shape.part, usd: checkedPrice(estimate, copies) };
    } catch (e) {
      if (e instanceof Refusal) return { part: shape.part, refusal: e.message };

      throw e;
    }
  }

  async quote(shapes) {
    const list = Array.isArray(shapes) ? shapes.slice(0, MAX_SHAPES) : [];
    const platformId = await this.platform();
    const replies = [];
    let error;

    for (const shape of list.filter((s) => typeof s?.part === 'string')) {
      try {
        replies.push(await this.quoteOne(shape, platformId));
      } catch (e) {
        error = e;

        if (!(e instanceof PartFailure)) break;
      }
    }

    if (error && !replies.length) throw error;

    return error ? { replies, error: error.message } : { replies };
  }
}
